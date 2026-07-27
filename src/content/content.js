/**
 * Table Extractor — content script.
 *
 * Injected on demand (activeTab + chrome.scripting) every time the popup opens,
 * so the guard below keeps a second injection from registering duplicate
 * listeners. It answers three messages: scan, highlight and extract.
 */
(() => {
  if (window.__TABLE_EXTRACTOR__) return;

  const OVERLAY_ID = '__table-extractor-overlay__';
  const ARIA_TABLE = '[role="table"], [role="grid"], [role="treegrid"]';
  const ARIA_ROW = '[role="row"]';
  const ARIA_CELL =
    '[role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]';

  /** Detected tables of the last scan, keyed by the id handed to the popup. */
  const registry = new Map();
  let nextId = 1;

  /* ------------------------------------------------------------------ *
   * Detection
   * ------------------------------------------------------------------ */

  function isVisible(el) {
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkVisibilityCSS: true });
    }
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /** Rows of a table element, native or ARIA, excluding rows of nested tables. */
  function rowsOf(table) {
    if (table.tagName === 'TABLE') {
      // HTMLTableElement.rows already skips nested tables and orders
      // thead → tbody → tfoot for us.
      return Array.from(table.rows);
    }
    return Array.from(table.querySelectorAll(ARIA_ROW)).filter(
      (row) => row.closest(ARIA_TABLE) === table
    );
  }

  /** Cells of a row, excluding cells that belong to a nested table. */
  function cellsOf(row) {
    if (row.tagName === 'TR') return Array.from(row.cells);
    return Array.from(row.querySelectorAll(ARIA_CELL)).filter(
      (cell) => cell.closest(ARIA_ROW) === row
    );
  }

  function isHeaderCell(cell) {
    return (
      cell.tagName === 'TH' ||
      cell.getAttribute('role') === 'columnheader' ||
      cell.getAttribute('role') === 'rowheader'
    );
  }

  function spanOf(cell, prop, ariaAttr) {
    const isNativeCell = cell.tagName === 'TD' || cell.tagName === 'TH';
    const raw = isNativeCell
      ? cell[prop]
      : parseInt(cell.getAttribute(ariaAttr) || '1', 10);
    const value = Number.isFinite(raw) ? raw : 1;
    // rowspan="0" means "to the end of the section"; cap spans so a bogus
    // colspan="10000" cannot blow up the grid.
    return Math.min(Math.max(value, 0), 1000);
  }

  /** Human-friendly name: caption → aria-label → nearest heading → fallback. */
  function nameOf(table, index) {
    const caption = table.querySelector(':scope > caption');
    const candidates = [
      caption && caption.textContent,
      table.getAttribute('aria-label'),
      table.getAttribute('summary'),
      table.getAttribute('title')
    ];
    const labelledBy = table.getAttribute('aria-labelledby');
    if (labelledBy) {
      const el = document.getElementById(labelledBy);
      if (el) candidates.push(el.textContent);
    }
    for (const candidate of candidates) {
      const text = (candidate || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 120);
    }

    // Walk backwards through the document for the closest preceding heading.
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    for (let i = headings.length - 1; i >= 0; i--) {
      const position = headings[i].compareDocumentPosition(table);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = (headings[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (text) return text.slice(0, 120);
      }
    }
    return `Table ${index + 1}`;
  }

  function detect() {
    registry.clear();
    nextId = 1;

    const elements = Array.from(
      document.querySelectorAll(`table, ${ARIA_TABLE}`)
    ).filter((el) => el.id !== OVERLAY_ID && isVisible(el));

    const found = [];
    elements.forEach((el, index) => {
      const rows = rowsOf(el);
      const cellCount = rows.reduce((sum, row) => sum + cellsOf(row).length, 0);
      // Two cells is the floor; it filters out spacer/layout tables without
      // dropping small but real one-row tables.
      if (rows.length === 0 || cellCount < 2) return;

      const grid = buildGrid(el, { textLimit: 60 });
      if (grid.rows.length === 0 || grid.columnCount === 0) return;

      const id = nextId++;
      registry.set(id, el);
      found.push({
        id,
        name: nameOf(el, index),
        rowCount: grid.rows.length,
        columnCount: grid.columnCount,
        headers: grid.headers,
        // First few body rows, so the popup can show a preview without a
        // second round trip.
        preview: grid.rows.slice(0, 4),
        kind: el.tagName === 'TABLE' ? 'table' : 'grid',
        nested: el.parentElement ? Boolean(el.parentElement.closest('table')) : false
      });
    });
    return found;
  }

  /* ------------------------------------------------------------------ *
   * Cell text + grid building
   * ------------------------------------------------------------------ */

  function cellText(cell, limit) {
    const clone = cell.cloneNode(true);

    // Form controls hold their value in the DOM, not in the markup, so copy it
    // across by index before anything is removed from the clone.
    const originals = cell.querySelectorAll('input, textarea, select');
    const copies = clone.querySelectorAll('input, textarea, select');
    copies.forEach((copy, i) => {
      const original = originals[i];
      if (!original) return;
      let value = '';
      if (original.tagName === 'SELECT') {
        value = original.selectedOptions?.[0]?.textContent || '';
      } else if (original.type === 'checkbox' || original.type === 'radio') {
        value = original.checked ? 'true' : 'false';
      } else {
        value = original.value || '';
      }
      copy.replaceWith(document.createTextNode(value));
    });

    clone
      .querySelectorAll(`script, style, noscript, table, ${ARIA_TABLE}`)
      .forEach((node) => node.remove());
    clone.querySelectorAll('br, hr').forEach((node) => node.replaceWith(' '));
    clone
      .querySelectorAll('img')
      .forEach((node) => node.replaceWith(document.createTextNode(node.alt || '')));

    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return limit && text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  /**
   * Flattens a table into a rectangular grid, expanding rowspan/colspan so the
   * exported rows line up. Spanned cells repeat their value, which is what
   * spreadsheets expect.
   */
  function buildGrid(table, { textLimit } = {}) {
    const domRows = rowsOf(table);
    const matrix = [];
    const headerFlags = [];

    domRows.forEach((row, r) => {
      if (!matrix[r]) matrix[r] = [];
      let c = 0;
      const cells = cellsOf(row);
      let allHeaders = cells.length > 0;

      cells.forEach((cell) => {
        while (matrix[r][c] !== undefined) c++;
        const text = cellText(cell, textLimit);
        if (!isHeaderCell(cell)) allHeaders = false;

        const colSpan = Math.max(spanOf(cell, 'colSpan', 'aria-colspan') || 1, 1);
        const rawRowSpan = spanOf(cell, 'rowSpan', 'aria-rowspan');
        // rowspan="0" spans the rest of the section.
        const rowSpan = rawRowSpan === 0 ? domRows.length - r : Math.max(rawRowSpan, 1);

        for (let i = 0; i < rowSpan && r + i < domRows.length; i++) {
          if (!matrix[r + i]) matrix[r + i] = [];
          for (let j = 0; j < colSpan; j++) matrix[r + i][c + j] = text;
        }
        c += colSpan;
      });

      headerFlags[r] = allHeaders;
    });

    const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const normalized = matrix.map((row) => {
      const out = new Array(columnCount);
      for (let i = 0; i < columnCount; i++) out[i] = row[i] === undefined ? '' : row[i];
      return out;
    });

    // How many leading rows are header rows: an explicit <thead> wins,
    // otherwise consecutive all-header rows from the top.
    let headerRows = 0;
    if (table.tagName === 'TABLE' && table.tHead && table.tHead.rows.length) {
      headerRows = table.tHead.rows.length;
    } else {
      while (headerRows < normalized.length && headerFlags[headerRows]) headerRows++;
      // An all-header table is data, not a header block.
      if (headerRows === normalized.length) headerRows = 0;
    }

    let headers = null;
    if (headerRows > 0) {
      const headerBlock = normalized.slice(0, headerRows);
      headers = [];
      for (let c = 0; c < columnCount; c++) {
        // Multi-row headers collapse into one label, de-duplicated so a
        // spanning "2024 / 2024" becomes just "2024".
        const parts = [];
        for (const row of headerBlock) {
          const value = (row[c] || '').trim();
          if (value && parts[parts.length - 1] !== value) parts.push(value);
        }
        headers.push(parts.join(' '));
      }
    }

    return {
      headers,
      rows: headerRows > 0 ? normalized.slice(headerRows) : normalized,
      columnCount
    };
  }

  /* ------------------------------------------------------------------ *
   * Highlight overlay
   * ------------------------------------------------------------------ */

  let highlighted = null;

  function overlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        position: 'absolute',
        zIndex: '2147483647',
        pointerEvents: 'none',
        border: '2px solid #2563eb',
        borderRadius: '4px',
        background: 'rgba(37, 99, 235, 0.12)',
        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.04)',
        transition: 'top .12s ease, left .12s ease, width .12s ease, height .12s ease',
        display: 'none'
      });
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function positionOverlay() {
    if (!highlighted || !highlighted.isConnected) return clearHighlight();
    const rect = highlighted.getBoundingClientRect();
    const el = overlay();
    el.style.display = 'block';
    el.style.top = `${rect.top + window.scrollY}px`;
    el.style.left = `${rect.left + window.scrollX}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  function highlight(id, scroll) {
    const el = registry.get(id);
    if (!el) return false;
    highlighted = el;
    if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    positionOverlay();
    window.addEventListener('scroll', positionOverlay, { passive: true });
    window.addEventListener('resize', positionOverlay, { passive: true });
    return true;
  }

  function clearHighlight() {
    highlighted = null;
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    window.removeEventListener('scroll', positionOverlay);
    window.removeEventListener('resize', positionOverlay);
  }

  /* ------------------------------------------------------------------ *
   * Messaging
   * ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      switch (message?.type) {
        case 'scan':
          sendResponse({
            ok: true,
            tables: detect(),
            pageTitle: document.title,
            pageUrl: location.href
          });
          break;
        case 'highlight':
          sendResponse({ ok: highlight(message.id, message.scroll) });
          break;
        case 'clearHighlight':
          clearHighlight();
          sendResponse({ ok: true });
          break;
        case 'extract': {
          const el = registry.get(message.id);
          if (!el) {
            sendResponse({ ok: false, error: 'That table is no longer on the page.' });
            break;
          }
          const grid = buildGrid(el);
          sendResponse({
            ok: true,
            data: {
              name: nameOf(el, message.id - 1),
              headers: grid.headers,
              rows: grid.rows,
              columnCount: grid.columnCount,
              pageTitle: document.title,
              pageUrl: location.href
            }
          });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown request: ${message?.type}` });
      }
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
    return true;
  });

  // The popup opens a port purely as a lifetime signal: when it closes, the
  // port disconnects and we take the highlight off the page.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'table-extractor') return;
    port.onDisconnect.addListener(clearHighlight);
  });

  window.__TABLE_EXTRACTOR__ = { version: '1.0.0' };
})();
