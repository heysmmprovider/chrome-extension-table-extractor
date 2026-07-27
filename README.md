# Table Extractor — Export Any Web Table to CSV, JSON & More

A tiny Chrome extension that finds every table on the page you are looking at, lets you
pick the one you actually want, and exports it as **CSV, TSV, JSON, Markdown or HTML** —
in two clicks, without copy-pasting into a spreadsheet and fixing the columns by hand.

No account. No servers. No tracking. Nothing leaves your browser.

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-2563eb)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
![No dependencies](https://img.shields.io/badge/dependencies-0-22c55e)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Features

- **Finds every table automatically** — classic `<table>` markup *and* modern `div` grids
  that use `role="table"` / `role="grid"` (React, Vue and data-grid libraries).
- **Pick the right one** — if a page has ten tables, you get a list with row/column counts
  and a column preview. Hovering an entry highlights that table right on the page.
- **Preview before you export** — see the first rows in the popup so you know you grabbed
  the correct table.
- **Five export formats** — CSV, TSV, JSON, Markdown and HTML.
- **Copy to clipboard** — paste straight into Sheets, Excel, Notion or a code editor.
- **Handles messy real-world tables** — merged cells (`colspan` / `rowspan`), two-row
  headers, `<thead>` / `<tbody>` sections, nested tables, and values sitting inside form
  inputs, checkboxes and dropdowns.
- **Genuinely private** — no network requests, no analytics, no permissions beyond the tab
  you explicitly click the button on.

## Install

### From the Chrome Web Store

Coming soon — the listing is in review.

### From source (works today)

1. Download or clone this repository:
   ```bash
   git clone https://github.com/your-username/chrome-extension-table-extractor.git
   ```
2. Open `chrome://extensions` in Chrome (or Edge, Brave, Opera — anything Chromium based).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the folder you just cloned.
5. Pin **Table Extractor** to your toolbar and you are done.

There is no build step. The repository *is* the extension.

## How to use it

1. Open any page that contains a table.
2. Click the **Table Extractor** icon.
3. Pick a table from the list — it lights up on the page and previews in the popup.
4. Choose a format and hit **Download**, or **Copy** it to your clipboard.

## Export formats

| Format | Extension | Best for |
| --- | --- | --- |
| CSV | `.csv` | Excel, Google Sheets, Numbers, pandas |
| TSV | `.tsv` | Pasting into spreadsheets without delimiter surprises |
| JSON | `.json` | Scripts and APIs — array of objects when the table has headers |
| Markdown | `.md` | READMEs, GitHub issues, docs, Notion |
| HTML | `.html` | A clean standalone copy of the table |

Text is quoted per RFC 4180, so commas, quotes and line breaks inside cells survive the
round trip.

## What it does with tricky tables

| Situation | Behaviour |
| --- | --- |
| `colspan` / `rowspan` | Expanded into a rectangular grid; merged values repeat across the cells they cover |
| Two-row headers | Collapsed into one label per column (`2024` + `Q1` → `2024 Q1`) |
| `<thead>` present | Treated as the header; everything else is data |
| No `<thead>`, first row all `<th>` | First row treated as the header |
| No headers at all | Exported as a plain array of rows |
| Nested tables | Listed separately; the parent cell does not swallow the child's text |
| Hidden tables (`display: none`) | Skipped |
| Layout tables (a single cell) | Skipped |
| `<input>`, `<select>`, checkboxes | The current value is exported, not the empty markup |

## Privacy & permissions

The extension requests exactly two permissions, and nothing else:

- **`activeTab`** — read the current tab, only after you click the toolbar icon.
- **`scripting`** — inject the table-detection script into that one tab.

There are no host permissions, no background service worker, no remote code, no analytics
and no network calls of any kind. Extracted data is turned into a file in your browser and
handed to Chrome's downloader. See [PRIVACY.md](PRIVACY.md).

Chrome blocks *all* extensions on `chrome://` pages, the Chrome Web Store and other
extensions' pages — the popup will tell you so if you try.

## Development

```
manifest.json          # MV3 manifest — permissions, popup, icons
src/
  content/content.js   # table detection, grid building, page highlight
  lib/formats.js       # CSV / TSV / JSON / Markdown / HTML serialisers
  popup/               # popup UI (html, css, js)
icons/                 # 16 / 32 / 48 / 128 px
test/fixtures.html     # test page + assertion harness
```

Vanilla JavaScript, ES modules, zero dependencies, no bundler.

### Running the tests

`test/fixtures.html` is a page full of awkward tables — merged cells, multi-row headers,
nested tables, ARIA grids, hidden tables. It loads the real content script behind a small
`chrome.*` shim and asserts the extracted output.

Open it in a browser with `?autorun=1`:

```bash
open "test/fixtures.html?autorun=1"
```

Results render at the bottom of the page (or call `runTests()` from the console). The same
page is the best manual smoke test: load the unpacked extension, open the popup on it, and
you should see seven tables.

## Known limitations

- Only the main page is scanned — tables inside `<iframe>`s are not detected yet.
- Tables rendered by infinite scroll or virtualised grids export only the rows currently in
  the DOM. Scroll first, then extract.

## Roadmap

- Tables inside iframes
- Excel (`.xlsx`) export
- Export every table on a page at once
- Column selection and row filtering before export
- Optional number/date normalisation

Issues and pull requests are welcome.

## About

Built and maintained by the team behind a group of social-media-marketing platforms. We
spend a lot of time pulling pricing and service tables off the web to compare them, which is
exactly the itch this extension scratches.

Our other projects:

- [HeySMM Reseller](https://heysmmreseller.com) — SMM reseller panel for agencies and resellers
- [HeySMM Provider](https://heysmmprovider.com) — SMM services provider and API
- [SMM Rangers](https://smmrangers.com) — social media marketing panel
- [SMM Royale](https://smmroyale.com) — social media marketing services
- [Best SMM Providers](https://bestsmmproviders.com) — reviews and comparisons of SMM providers

## License

[MIT](LICENSE) © Ozan Dikbas
