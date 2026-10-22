/**
 * Grace Baptist Church - Harvest Family Night Photo Booth
 *
 * Back end for the photo booth page (index.html, hosted on GitHub Pages).
 * The sign-in station sends each family's name, email and phone, and gets
 * back a sign-in number. The photo station lists the sign-ins and adds the
 * camera's photo number to each one. Sender.gs emails the photos afterward.
 * See SETUP.md for how to deploy it.
 *
 * The script finds its columns by their header names, so you can add your own
 * columns to the right of the Sign-Ins tab.
 */

const SIGNINS = 'Sign-Ins';
const SETTINGS = 'Email Settings';
const HEADERS = ['Sign-In #', 'Signed In At', 'Name(s)', 'Email', 'Phone', 'Photo #',
                 'Ready to Send', 'Sent', 'Photo File(s)', 'Notes', 'Photo # Added At'];
const TIME_FORMAT = 'm/d h:mm am/pm';
const MAX_BAD_CODES = 20; // wrong staff codes allowed per 10 minutes, across all iPads

/** GET: lets the page (or you, in a browser) check that the script is reachable. */
function doGet() {
  return json_({ status: 'ok' });
}

/**
 * POST from the page, body {code, action, ...}. The page sends it as plain
 * text with no Google login attached, so the iPads don't need a Google account.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!codeIsRight_(body.code)) return json_({ status: 'badcode' });
    switch (body.action) {
      case 'check': return json_({ status: 'ok' });
      case 'signIn': return json_(signIn_(body.guest || {}));
      case 'list': return json_({ status: 'ok', rows: listSignIns_() });
      case 'setPhoto': return json_(setPhoto_(body.number, body.photo));
    }
    throw new Error('The page sent a request the script doesn\'t know. Reload the page.');
  } catch (err) {
    return json_({ status: 'error', message: err.message });
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the editor. It checks the Sign-Ins and Email Settings
 * tabs, grants permissions, and creates the staff code (the first time),
 * which it shows in the Execution log. To change the code, edit STAFF_CODE
 * under Project Settings > Script Properties.
 */
function setup() {
  const sheet = signInsSheet_();
  settingsSheet_();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);

  const props = PropertiesService.getScriptProperties();
  let code = props.getProperty('STAFF_CODE');
  if (!code) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('STAFF_CODE', code);
  }
  Logger.log('Staff code: ' + code);
}

/**
 * Checks the staff code against the STAFF_CODE Script Property, refusing
 * everything for 10 minutes after too many wrong ones. The code isn't in
 * this file, so the public copy on GitHub doesn't give it away.
 */
function codeIsRight_(code) {
  const expected = PropertiesService.getScriptProperties().getProperty('STAFF_CODE');
  if (!expected) throw new Error('The staff code hasn\'t been set up yet. Run setup in Apps Script.');
  const cache = CacheService.getScriptCache();
  const misses = Number(cache.get('badStaffCode') || 0);
  if (misses >= MAX_BAD_CODES) throw new Error('Too many wrong codes. Wait 10 minutes and try again.');
  if (String(code || '').trim() === expected.trim()) return true;
  cache.put('badStaffCode', String(misses + 1), 600);
  return false;
}

// ---- Sign-ins --------------------------------------------------------------

function signIn_(guest) {
  const name = clean_(guest.name, 120);
  const email = clean_(guest.email, 120).toLowerCase().replace(/\s+/g, '');
  const phone = formatPhone_(guest.phone);
  if (!name) throw new Error('Please type your name.');
  if (!email && !phone) throw new Error('Please give an email or a phone number so we can send your photo.');
  if (email && !/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(email)) throw new Error('That email address doesn\'t look right.');
  if (guest.phone && !phone) throw new Error('Please type the phone number with its area code.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = signInsSheet_();
    const cols = columns_(sheet);
    const last = sheet.getLastRow();
    const numbers = last > 1 ? sheet.getRange(2, cols['Sign-In #'], last - 1, 1).getValues() : [];
    const number = numbers.reduce((max, r) => Math.max(max, Number(r[0]) || 0), 0) + 1;

    const record = {
      'Sign-In #': number,
      'Signed In At': new Date(),
      'Name(s)': name,
      'Email': email,
      'Phone': phone,
      'Ready to Send': false,
    };
    const row = new Array(sheet.getLastColumn()).fill('');
    Object.keys(record).forEach((h) => { row[cols[h] - 1] = record[h]; });
    sheet.getRange(last + 1, 1, 1, row.length).setValues([row]);
    return { status: 'ok', number: number };
  } finally {
    lock.releaseLock();
  }
}

/** Every sign-in, newest first, with only what the photo station needs. */
function listSignIns_() {
  const sheet = signInsSheet_();
  const cols = columns_(sheet);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues()
    .filter((r) => r[cols['Sign-In #'] - 1] !== '')
    .map((r) => {
      const at = r[cols['Signed In At'] - 1];
      return {
        number: Number(r[cols['Sign-In #'] - 1]),
        name: String(r[cols['Name(s)'] - 1]),
        time: at instanceof Date ? Utilities.formatDate(at, tz, 'h:mm a') : '',
        photo: String(r[cols['Photo #'] - 1]),
        hasEmail: String(r[cols['Email'] - 1]).includes('@'),
        sent: r[cols['Sent'] - 1] !== '',
      };
    })
    .sort((a, b) => b.number - a.number);
}

/**
 * Saves the photo number(s) for one sign-in. The camera's file is DSC00527.jpg,
 * so "527", "00527" and "DSC00527" all save as 527. Several numbers can be
 * separated by commas or spaces. A blank clears it.
 */
function setPhoto_(number, photo) {
  const groups = String(photo || '').match(/\d+/g) || [];
  if (groups.some((g) => g.length < 3)) throw new Error('Type the last three digits of the photo\'s number, like 527.');
  const value = groups.map((g) => g.slice(-3)).join(', ');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = signInsSheet_();
    const cols = columns_(sheet);
    const last = sheet.getLastRow();
    const numbers = last > 1 ? sheet.getRange(2, cols['Sign-In #'], last - 1, 1).getValues() : [];
    const index = numbers.findIndex((r) => Number(r[0]) === Number(number));
    if (index === -1) throw new Error('Sign-in #' + number + ' isn\'t in the sheet any more.');
    const rowNum = index + 2;
    const hasEmail = String(sheet.getRange(rowNum, cols['Email']).getValue()).includes('@');
    sheet.getRange(rowNum, cols['Photo #']).setValue(value);
    sheet.getRange(rowNum, cols['Ready to Send']).setValue(Boolean(value && hasEmail));
    sheet.getRange(rowNum, cols['Photo # Added At']).setValue(value ? new Date() : '');
    return { status: 'ok', photo: value };
  } finally {
    lock.releaseLock();
  }
}

// ---- Tabs and helpers -----------------------------------------------------

/** The Sign-Ins tab, created or given any missing headers. */
function signInsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SIGNINS) || ss.insertSheet(SIGNINS, 0);
  const width = Math.max(sheet.getLastColumn(), 1);
  const have = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const missing = HEADERS.filter((h) => have.indexOf(h) === -1);
  if (missing.length) {
    const start = have.every((h) => h === '') ? 1 : width + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#233617');
    sheet.setFrozenRows(1);
    const cols = columns_(sheet);
    const rows = sheet.getMaxRows() - 1;
    ['Signed In At', 'Sent', 'Photo # Added At'].forEach((h) => {
      sheet.getRange(2, cols[h], rows, 1).setNumberFormat(TIME_FORMAT);
    });
    ['Phone', 'Photo #'].forEach((h) => sheet.getRange(2, cols[h], rows, 1).setNumberFormat('@'));
    sheet.getRange(2, cols['Ready to Send'], rows, 1).insertCheckboxes();
  }
  return sheet;
}

/** The Email Settings tab Sender.gs reads, created with defaults if it's missing. */
function settingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SETTINGS);
  sheet.getRange(1, 1, 7, 2).setValues([
    ['Setting', 'Value'],
    ['Drive folder with the photos', 'Type the photo folder\'s name here after the event'],
    ['Email subject', 'Your photo from Harvest Family Night'],
    ['Email message', 'Hi {name},\n\nThanks for stopping by the photo booth at Harvest Family Night. ' +
      'Your picture is attached. We hope you enjoy it!\n\nGrace Baptist Church'],
    ['Sender name', 'Grace Baptist Church'],
    ['Send from address', ''],
    ['How it works', '{name} in the message is replaced with the Name(s) column. Leave "Send from ' +
      'address" blank to send from the account running the script.'],
  ]);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setFontColor('#ffffff').setBackground('#233617');
  sheet.getRange(2, 1, 6, 1).setFontWeight('bold');
  sheet.getRange(2, 2, 6, 1).setWrap(true);
  sheet.setColumnWidth(1, 220).setColumnWidth(2, 520);
  return sheet;
}

/** {header name: 1-based column number} for row 1 of a tab. */
function columns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const cols = {};
  headers.forEach((h, i) => { if (h !== '' && !cols[h]) cols[h] = i + 1; });
  return cols;
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 7655551234, (765) 555-1234 and +1 765 555 1234 all become 765-555-1234. */
function formatPhone_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return '';
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}
