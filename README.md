# Scout Program Builder

A small web app for building a term program to share with Scout families. It runs entirely in the browser and is hosted on GitHub Pages. There's no server and no build step.

## Features

- **Generates meeting dates automatically.** Pick the region, year, term and meeting night, and you get one row per meeting with its term week number. Weeks can run Monday–Sunday or Sunday–Saturday. Meeting nights on a public holiday automatically become weeks off, such as "No Cubs – Labour Day", and don't use up a duty patrol turn.
  - **Term dates** are built in for every state and territory: SA 2025–2028, VIC 2026–2029, QLD and WA 2026–2028, and NSW (Eastern and Western divisions), TAS, ACT and NT 2026–2027. For other years or places, choose *Other / custom* and type the dates. ACT and NT dates come from sources quoting the official tables, because their sites couldn't be reached, so double-check those.
  - **Public holidays** are worked out from each state's rules, and checked against data.gov.au (2021–2025) and, for SA, SafeWork SA's 2025–2028 list. They include part-day holidays that clash with evening meetings (SA and NT Christmas Eve and New Year's Eve from 7pm, QLD Christmas Eve from 6pm). Regional or restricted days are left out (show days, NSW Bank Holiday, Hobart Regatta, TAS Recreation Day and Easter Tuesday), as are WA holidays from 2028 (WA's law changes) and Victoria's AFL Grand Final Friday until it's announced each year. Add any of those as weeks off.
- **Edit in place.** Click any cell on the page preview to type. Clicking a date shows the seven days of that row's week: pick one and the date fills in. The picker also takes a full date, a multi-day end date or custom text like "Sat or Sun 7 or 8 Nov". Clicking a challenge area, duty patrol, leader or uniform cell lets you choose from a list (uniform is Yes or No, with *Other* for things like "Camp"). Leaders come from your *Leaders* list, and *Other leader* adds someone from outside the section (e.g. "Roo (Joeys)"), who is then offered for other rows too. Renaming a leader updates the program.
- **Row options.** Hover over a row and use the **⋮** handle to add an activity below or above (in the same week), duplicate, move, highlight or delete it. Rows in the same week share one merged *Week* cell. *Move to Week N* shifts an activity a whole week up or down, keeping its weekday.
- **Weeks off.** *Add week off* adds a week with no section night (public holiday, school holidays, or your own text). It shows as a shaded row across the table, keeping its Week and Date. An empty meeting row on that date is reused. Any row can also be switched with *Mark as no meeting* in its menu. Weeks outside the term dates show "Hols" (changeable under *Page & layout*).
- **Always in order.** Rows sort themselves by date, then start time ("18:15", "6:30 PM" and "9 AM" are all understood). Activities without a time, like "TBA", go last on their day. Changing a time re-sorts when you leave the cell.
- **Fits one page.** Text shrinks until the program fits on one A4 or Letter page. If there's spare room, rows stretch to fill it. If it can't fit, it prints over several pages with the table header repeated, and the preview marks where each page break will fall.
- **Words never break.** If a word doesn't fit its column, the column widens by borrowing room from columns with space to spare. If that isn't enough, that cell's text shrinks (to no less than 70% of the table text), and as a last resort the whole table shrinks. Dates stay on one line.
- **Descriptions fit two lines.** Each description shrinks on its own to stay within two lines, or the height of the tallest other cell in its row. This can be turned off under *Page & layout*.
- **Branding.** Group name ("1st" is shown as a superscript), section preset (Joeys, Cubs, Scouts, Venturers, Rovers or custom) with the official section logo and colour, title template, your own logo upload, font, leaders and phone numbers, version note and footer.
- **Dates & notes.** A section under the program, like the Joey program's: *Dates for your calendar* (fundraisers, camps, group events) on the left and a box of notes on the right. Edit it under *Dates & notes* in the sidebar (or the phone menu). It's left out when empty, and a new term's program starts without it.
- **Columns.** Show or hide, rename, reorder, resize and set the alignment of each column. If you hide *Time*, the time moves into the date cell.
- **Lists.** Highlight colours with a legend (Scout Hall, Out and About, EVENT, Bring a Friend, …), challenge areas using the official Scouts Australia icons (you can upload a different icon for any area), and duty patrols with colours, which rotate automatically when dates are generated.
- **Several programs.** **Programs** lists every program saved in this browser (for example Cubs T4 and Scouts T4, or last term's), to open, duplicate or delete. **New** starts another one for the same or next term, keeping your branding, leaders, columns and lists. Everything saves automatically. **Save file** offers two formats:
  - **Activities spreadsheet (.csv)** opens in Excel, Google Sheets or Numbers, so another leader can fill in or fix activities and send it back. Dates are written like "Tue 13 Oct 2026" so spreadsheets leave them alone. Day/month/year dates, renamed headings and missing columns are all handled when it's opened again.
  - **Full program (.json)** keeps everything, including branding, logo, leaders, lists and settings.

  **Open** accepts either. A spreadsheet's activities can replace the current program's activities or start a new program with the same branding.
- **Calendar file.** **Calendar** downloads an `.ics` file that families can open to add the program to Google, Apple or Outlook calendars. Each meeting has its times (read from the Time cell), location (*Where*) and details. Untimed items are all-day events, and weeks off are included as free all-day entries.
- **PDF made in the app.** **Save file → PDF** builds the PDF itself, so it's identical in every browser. iPhone and iPad Safari ignore a page's print orientation and add their own margins, so on those devices **Print** opens this PDF instead, and iOS's viewer prints it correctly. (The first PDF loads two small libraries from cdnjs, so it needs to be online.)
- **Print / PDF.** Uses the browser's print dialog. Choose *Save as PDF* (the file is named after the program, e.g. "Cubs Program - Term 4 2026"), and turn off the browser's own *Headers and footers* option.

### On phones and tablets

Phones and tablets get a touch-friendly view instead of editing the sheet directly:

- **Week list.** A short list with one row per activity (date, time, activity, patrol and leader), so a whole term fits on about a screen. Tap the title to switch programs.
- **Activity editor.** Tap a row to edit it. You get day buttons for its week, big text boxes, and tap-to-pick patrol, leader, challenge area and highlight. From there you can mark it as no meeting, move it a week, duplicate or delete it, or add another activity that week.
- **Add.** Adds an activity on the next free meeting night, or a week off.
- **Menu.** Programs, new, open, generate dates and undo, plus every settings section from the desktop sidebar, each on its own screen.
- **Preview.** Shows the real printed sheet (pinch to zoom) and whether it fits one page.
- **Share.** **Program PDF** makes the PDF in the app (always the right page size and orientation, on one page when it fits), then opens the share menu so you can print, email, message or save it. You can also send the calendar file, activities spreadsheet or full program file.

The menu's *Use the desktop editor* switches back to the sheet editor, and *Switch to the mobile view* (bottom of the desktop sidebar) does the reverse.

Desktop editing works in current Chrome, Edge, Firefox and Safari.

## Hosting on GitHub Pages

1. Merge into `main`.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then **`main`** and **`/ (root)`**.
4. After a minute the site is live at [https://no5tyle.github.io/programmer/](https://no5tyle.github.io/programmer/).

## Running locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

## Publishing changes

GitHub Pages lets browsers keep each file for up to 10 minutes. The CSS and JS links in `index.html` carry a `?v=` tag so browsers fetch all files together. Bump it whenever you change those files.

## Updating term dates and holidays

Term dates are in `js/data.js` under `TERM_DATES`, as `[start, end]` pairs for each term (students' first and last days). Regions are listed in `REGIONS`, and public holiday rules are `saPublicHolidays` and `auPublicHolidays`, wired up in `PUBLIC_HOLIDAYS`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App layout and sidebar controls |
| `css/app.css` | App styling, the program document, and print rules |
| `js/data.js` | Section colours, term dates, default columns and lists, challenge-area icon paths |
| `assets/section-logos/` | Official Scouts Australia vertical Section logos (from the public Scouts NSW logo pack), cropped and resized but otherwise used as provided |
| `assets/challenge-areas/` | Official Scouts Australia Challenge Area icons, from the Program Icons page at resources.scouts.com.au, used as provided |
| `js/app.js` | State, rendering, auto-fit, editing, import/export |
| `js/mobile.js`, `css/mobile.css` | Phone and tablet view |
