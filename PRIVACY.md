# Privacy Policy — Table Extractor

_Last updated: 27 July 2026_

Table Extractor does not collect, store, transmit or sell any data.

## What the extension does

When you click the toolbar icon, the extension injects a script into the tab that is open
in front of you. That script looks for tables in the page, and sends what it finds to the
extension's popup so you can pick one and export it. When you press **Download** or
**Copy**, the selected table is converted to text inside your browser and handed to
Chrome's download manager or clipboard.

## Data collection

**None.** Specifically:

- No personal information is collected.
- No browsing history, page content or extracted table data is sent anywhere.
- The extension makes no network requests whatsoever — there is no server behind it.
- There is no analytics, telemetry, crash reporting or advertising code.
- Nothing is stored between sessions; the extension keeps no database and writes nothing
  to `chrome.storage`.

The table data you extract exists only in the popup while it is open, and in the file you
choose to save.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| `activeTab` | Grants temporary access to the current tab, and only after you click the extension icon. This is what lets the extension read the tables on the page you are looking at. |
| `scripting` | Lets the extension inject its table-detection script into that tab. |

The extension requests no host permissions, so it has no standing access to any website.
It cannot run in the background or on pages where you have not clicked the icon.

## Third parties

There are none. The extension bundles no third-party libraries, loads no remote code, and
shares data with nobody.

## Changes

If this policy ever changes, the updated version will be published in this repository with
a new date at the top.

## Contact

Questions? Open an issue on the GitHub repository.
