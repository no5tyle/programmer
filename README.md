# Scout Program Builder

A small web app for building a term program to share with Scout families. It runs entirely in the browser and is hosted on GitHub Pages. There's no server and no build step.

## Features

- **Generates meeting dates automatically.** Pick the region, year, term and meeting night, and you get one row per meeting with its term week number. Weeks can run Monday–Sunday or Sunday–Saturday. South Australian term dates are built in for 2025–2028 (Term 4 2028 not yet published). For anywhere else, choose *Other / custom* and type the dates.
- **Edit in place.** Click any cell on the page preview to type. Clicking a date shows the seven days of that row's week: pick one and the date fills in. The picker also takes a full date, a multi-day end date or custom text like "Sat or Sun 7 or 8 Nov". Clicking a challenge area or duty patrol cell lets you choose from a list.
- **Row options.** Hover over a row and use the **⋮** handle to add an activity below or above (in the same week), duplicate, move, highlight or delete it. Rows in the same week share one merged *Week* cell. Moving the top activity of a week up moves it into the week above (same weekday, new date), and moving the bottom one down moves it into the week below.
- **Fits one page.** Text shrinks until the program fits on one A4 or Letter page. If there's spare room, rows stretch to fill it. If it can't fit, it prints over several pages with the table header repeated, and the preview marks where each page break will fall.
- **Words never break.** If a word doesn't fit its column, the column widens by borrowing room from columns with space to spare. If that isn't enough, that cell's text shrinks (to no less than 70% of the table text), and as a last resort the whole table shrinks. Dates stay on one line.
- **Descriptions fit two lines.** Each description shrinks on its own to stay within two lines, or the height of the tallest other cell in its row. This can be turned off under *Page & layout*.
- **Branding.** Group name ("1st" is shown as a superscript), section preset (Joeys, Cubs, Scouts, Venturers, Rovers or custom) with the official section logo and colour, title template, your own logo upload, font, leaders and phone numbers, version note and footer.
- **Columns.** Show or hide, rename, reorder, resize and set the alignment of each column. If you hide *Time*, the time moves into the date cell.
- **Lists.** Highlight colours with a legend (Scout Hall, Out and About, EVENT, Bring a Friend, …), challenge areas using the official Scouts Australia icons (you can upload a different icon for any area), and duty patrols with colours, which rotate automatically when dates are generated.
- **Saving.** Your work saves automatically in your browser. **Save file** downloads a `.json` copy you can keep or send to another leader, and **Open** loads one back.
- **Print / PDF.** Uses the browser's print dialog. Choose *Save as PDF*, and turn off the browser's own *Headers and footers* option.

Built for desktop browsers (current Chrome, Edge, Firefox or Safari).

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

## Adding term dates

Term dates are in `js/data.js` under `TERM_DATES`, as `[start, end]` pairs for each term. Add a new region key (such as `VIC`) and a matching `<option>` in the Region select in `index.html`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App layout and sidebar controls |
| `css/app.css` | App styling, the program document, and print rules |
| `js/data.js` | Section colours, term dates, default columns and lists, challenge-area icon paths |
| `assets/section-logos/` | Official Scouts Australia vertical Section logos (from the public Scouts NSW logo pack), cropped and resized but otherwise used as provided |
| `assets/challenge-areas/` | Official Scouts Australia Challenge Area icons, from the Program Icons page at resources.scouts.com.au, used as provided |
| `js/app.js` | State, rendering, auto-fit, editing, import/export |
