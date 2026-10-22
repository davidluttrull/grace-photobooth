# Photo Booth: Setup

This replaces the paper Photo Booth Sign-In Sheet for Harvest Family Night. Families add their names on an iPad at the booth, and a worker adds the camera's photo number to each family. After the event, the Sheet emails every family their photo.

It has two parts:

- **The Sheet and its script** (`Code.gs` and `Sender.gs`). The script lives inside the Google Sheet. `Code.gs` saves each family's name and photo number. `Sender.gs` adds the **Photo Booth** menu that emails the photos.
- **The page** (`index.html`, plus the logo, icons and `manifest.webmanifest`), hosted on GitHub Pages. It has two modes, switched with the buttons at the top right:
  - **Names:** a family types their name, email and phone. After they confirm, the page shows their number in large type.
  - **Photo Numbers:** every family, newest first, each with a box for the photo number. New names show up within a few seconds, and **Refresh** checks right away. A name added on the same iPad shows up immediately.

With two workers, one iPad stays on Names and the other on Photo Numbers. With one worker, a single iPad switches between the two.

The page talks to the script without any Google sign-in. Each iPad needs the **staff code** once, a 6-digit number the script creates, and remembers it after that.

## 1. Pick the Google account

The emails go out from the account that runs the **Photo Booth** menu. To send from `david.luttrull@gracetoanderson.com`, the Sheet and script need to be on that account:

1. Share the **2027 HFN Photo Booth Sign-Ins** Sheet with the church account.
2. Sign in as the church account, open the Sheet, and choose **File → Make a copy**.
3. Use the copy from here on. The original can be deleted.

## 2. Add the script

1. In the Sheet, open **Extensions → Apps Script**.
2. Rename the project **Photo Booth**.
3. Replace what's in `Code.gs` with this folder's `Code.gs`.
4. Click **+** next to "Files", choose **Script**, name it `Sender`, and paste in `Sender.gs`.
5. Click the save icon.

## 3. Run setup once

1. With **Code.gs** open, pick **setup** in the function dropdown and click **Run**.
2. Approve the permissions. At "Google hasn't verified this app", click **Advanced → Go to Photo Booth (unsafe) → Allow**. That warning is normal for a script you wrote yourself.
3. Open **Execution log**. The last line reads **Staff code: 123456**, with your own number. That's the code the iPads need.

## 4. Deploy the script

1. Click **Deploy → New deployment**, then the gear next to "Select type", then **Web app**.
2. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

Opening that URL in a browser should show `{"status":"ok"}`.

## 5. Connect the page

In `index.html`, find `const API_URL = '';` and put the `/exec` URL between the quotes. Then publish the page.

## 6. Set up the iPads

1. Open the page in Safari. The page asks for the staff code once.
2. Bookmark it, or open a station directly: `…/grace-photobooth/#names` or `…/grace-photobooth/#photos`. (**Share → Add to Home Screen** also works; it shows up as **Photo Booth** with the Grace icon.)
3. On the Names iPad, consider turning on **Guided Access** (Settings → Accessibility → Guided Access). It keeps families inside the page.

## At the event

- **Names:** the family types their name (parents' names), email and phone. Tapping @gmail.com, @yahoo.com and the other buttons fills in the end of the email. If an email looks misspelled (gmial.com, yahooo.com and similar), the page offers the fix. Before saving, it shows everything in large type so the family can check it. They need at least an email or a phone number.
- The page then shows their **number** and returns to a blank form after 20 seconds, or sooner if someone taps **Next family**.
- **Photo Numbers:** when the photographer takes a family's picture, type the last three digits of the camera's file number (DSC00**527** → `527`) in that family's box and tap **Save** or Return. Several photos go in one box, separated by commas: `570, 573`. Typing the whole number, like `DSC00527` or `00527`, also saves as `527`.
- **Needs photo #** lists the families still waiting. **All** shows everyone, so you can fix a number already saved. Search finds a family by name or number.
- Saving a photo number checks **Ready to Send** in the Sheet, unless the family left no email.

If the Wi-Fi drops, nothing typed is lost. Names keeps the form filled in so the family can tap Add My Name again, and Photo Numbers keeps checking until it reconnects.

## After the event: sending the photos

1. Upload the photos folder to Google Drive, in the same account that owns the Sheet.
2. On the **Email Settings** tab, type the folder's exact name. Check the subject, message and sender name while you're there.
3. Use the **Photo Booth** menu:
   - **Match photos from Drive** links each row to its photo. A row that says MISSING has a number with no file in the folder.
   - **Send a test email to me** sends one row's email to you.
   - **Send photos to checked rows** emails everyone with **Ready to Send** checked and **Sent** blank, then puts the time in **Sent**. Running it again skips anyone already sent.

## Changing the staff code

In Apps Script, open **Project Settings** (the gear), scroll to **Script Properties**, and change **STAFF_CODE**. It works right away. Each iPad asks for the new code the next time it talks to the Sheet.

## Updating the script

After changing `Code.gs` or `Sender.gs`, paste it into Apps Script, save, run **setup** once, then click **Deploy → Manage deployments → pencil → Version: New version → Deploy**. Don't use **New deployment**: it makes a new URL, and the page would stop reaching the Sheet.

## Next year

Make a copy of this year's Sheet, delete its rows below the headers, and redo steps 2 to 5 on the copy. The copy gets its own staff code, so the old iPads ask for the new one.
