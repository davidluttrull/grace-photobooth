/**
 * Emails each family their photo after the event. Adds a "Photo Booth" menu
 * to the Sheet: match the photos in Drive, send yourself a test, then send.
 * The settings (photo folder, subject, message, sender) are on the
 * Email Settings tab.
 */

const TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script stops at 6 minutes

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Photo Booth')
    .addItem('1. Match photos from Drive', 'matchPhotos')
    .addItem('2. Send a test email to me', 'sendTest')
    .addItem('3. Send photos to checked rows', 'sendPhotos')
    .addToUi();
}

function getSettings_() {
  const v = settingsSheet_().getRange('B2:B6').getValues().map((r) => String(r[0]).trim());
  return { folder: v[0], subject: v[1], body: v[2], fromName: v[3], fromAddress: v[4] };
}

// Gmail options for every send. A "Send from address" only works if it is set up
// under Gmail Settings > Accounts > "Send mail as" for the account running this script.
function mailOptions_(settings, attachments) {
  const opts = { attachments: attachments, name: settings.fromName };
  const from = settings.fromAddress;
  if (from && from.toLowerCase() !== Session.getActiveUser().getEmail().toLowerCase()) {
    const aliases = GmailApp.getAliases().map((a) => a.toLowerCase());
    if (!aliases.includes(from.toLowerCase())) {
      throw new Error('Gmail will not send as ' + from + ' from ' + Session.getActiveUser().getEmail() +
        '. Add it under Gmail Settings > Accounts > "Send mail as", or run this sheet from that account.');
    }
    opts.from = from;
  }
  return opts;
}

// Map "527" -> Drive file, using the last three digits of the DSC number.
// DSC00533-2.jpg counts as 533; if two files share a number, the edited "-2" one wins.
function getPhotoFiles_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    throw new Error('No Drive folder named "' + folderName + '". Upload the photos folder to Google Drive, ' +
      'then put its name on the Email Settings tab.');
  }
  const byNum = {};
  const files = folders.next().getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/DSC\d*?(\d{3})(-\d+)?\.jpe?g$/i);
    if (!m) continue;
    if (!byNum[m[1]] || m[2]) byNum[m[1]] = f;
  }
  return byNum;
}

function photoNums_(cell) {
  return String(cell).match(/\d{3}/g) || [];
}

function matchPhotos() {
  const sheet = signInsSheet_();
  const cols = columns_(sheet);
  const byNum = getPhotoFiles_(getSettings_().folder);
  const last = sheet.getLastRow();
  if (last < 2) return SpreadsheetApp.getUi().alert('No sign-ins yet.');
  const nums = sheet.getRange(2, cols['Photo #'], last - 1, 1).getValues();
  const out = nums.map(([cell]) => {
    const wanted = photoNums_(cell);
    if (!wanted.length) return [SpreadsheetApp.newRichTextValue().setText('').build()];
    const parts = wanted.map((n) => byNum[n] ? byNum[n].getName() : 'MISSING ' + n);
    const rich = SpreadsheetApp.newRichTextValue().setText(parts.join(', '));
    let pos = 0;
    wanted.forEach((n, i) => {
      if (byNum[n]) rich.setLinkUrl(pos, pos + parts[i].length, byNum[n].getUrl());
      pos += parts[i].length + 2;
    });
    return [rich.build()];
  });
  sheet.getRange(2, cols['Photo File(s)'], out.length, 1).setRichTextValues(out);
  const missing = out.filter((r) => r[0].getText().includes('MISSING')).length;
  const matched = out.filter((r) => r[0].getText() && !r[0].getText().includes('MISSING')).length;
  SpreadsheetApp.getUi().alert('Matched photos for ' + matched + ' rows.' +
    (missing ? ' ' + missing + ' rows say MISSING in the Photo File(s) column.' : ''));
}

function buildEmail_(record, settings, byNum) {
  const files = photoNums_(record['Photo #']).map((n) => byNum[n]);
  if (!files.length || files.some((f) => !f)) return null;
  return {
    subject: settings.subject,
    body: settings.body.replace(/\{name\}/g, String(record['Name(s)']).trim()),
    attachments: files.map((f) => f.getBlob()),
  };
}

/** Each data row as {header: value}, with its sheet row number in _row. */
function records_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map((r, i) => {
    const rec = { _row: i + 2 };
    headers.forEach((h, c) => { if (h !== '' && !(h in rec)) rec[h] = r[c]; });
    return rec;
  });
}

function sendTest() {
  const ui = SpreadsheetApp.getUi();
  const settings = getSettings_();
  const byNum = getPhotoFiles_(settings.folder);
  const rec = records_(signInsSheet_())
    .find((r) => r['Ready to Send'] === true && buildEmail_(r, settings, byNum));
  if (!rec) return ui.alert('No checked row with a matching photo to use for the test.');
  const msg = buildEmail_(rec, settings, byNum);
  const me = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(me, '[TEST] ' + msg.subject, msg.body, mailOptions_(settings, msg.attachments));
  ui.alert('Sent a test to ' + me + ' using the row for ' + rec['Name(s)'] + '.');
}

function sendPhotos() {
  const ui = SpreadsheetApp.getUi();
  const sheet = signInsSheet_();
  const cols = columns_(sheet);
  const settings = getSettings_();
  const todo = records_(sheet).filter((r) =>
    r['Ready to Send'] === true && !r['Sent'] && String(r['Email']).includes('@'));
  if (!todo.length) return ui.alert('Nothing to send. Check "Ready to Send" on rows that have not been sent yet.');
  if (ui.alert('Send photos to ' + todo.length + ' people?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const byNum = getPhotoFiles_(settings.folder);
  const start = Date.now();
  let sent = 0, skipped = 0;
  for (const r of todo) {
    if (Date.now() - start > TIME_LIMIT_MS) {
      ui.alert('Sent ' + sent + ' so far and stopped before the time limit. Run "Send photos" again to finish the rest.');
      return;
    }
    const msg = buildEmail_(r, settings, byNum);
    if (!msg) {
      sheet.getRange(r._row, cols['Notes']).setValue('Not sent: photo not found in Drive. ' + r['Notes']);
      skipped++;
      continue;
    }
    GmailApp.sendEmail(String(r['Email']).trim(), msg.subject, msg.body, mailOptions_(settings, msg.attachments));
    sheet.getRange(r._row, cols['Sent']).setValue(new Date());
    SpreadsheetApp.flush();
    sent++;
  }
  ui.alert('Sent ' + sent + ' emails.' + (skipped ? ' Skipped ' + skipped + ' (see Notes).' : ''));
}
