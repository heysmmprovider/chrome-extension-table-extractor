import { FORMATS, buildFilename } from '../lib/formats.js';

const els = {
  status: document.getElementById('status'),
  picker: document.getElementById('picker'),
  list: document.getElementById('table-list'),
  count: document.getElementById('table-count'),
  previewPanel: document.getElementById('preview-panel'),
  preview: document.getElementById('preview'),
  previewMeta: document.getElementById('preview-meta'),
  footer: document.getElementById('footer'),
  format: document.getElementById('format'),
  download: document.getElementById('download'),
  copy: document.getElementById('copy'),
  rescan: document.getElementById('rescan'),
  toast: document.getElementById('toast')
};

const PREVIEW_ROWS = 12;

let tabId = null;
let port = null;
let selected = null; // { id, data }

/* -------------------------------------------------------------------- *
 * Plumbing
 * -------------------------------------------------------------------- */

function send(message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response from the page.' });
    });
  });
}

function showStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.hidden = false;
  els.status.classList.toggle('error', isError);
}

function toast(text) {
  els.toast.textContent = text;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.textContent = '';
  }, 2500);
}

/* -------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------- */

function renderList(tables) {
  els.list.replaceChildren();
  els.count.textContent = `${tables.length} table${tables.length === 1 ? '' : 's'} found`;

  tables.forEach((table, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-item';
    button.setAttribute('aria-pressed', 'false');
    button.dataset.id = String(table.id);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${index + 1}. ${table.name}`;

    const meta = document.createElement('span');
    meta.className = 'meta';
    const columns = table.columnCount;
    const sample = (table.headers || table.preview[0] || []).filter(Boolean).slice(0, 4).join(' · ');
    meta.textContent =
      `${table.rowCount} row${table.rowCount === 1 ? '' : 's'} × ${columns} col${columns === 1 ? '' : 's'}` +
      (sample ? ` — ${sample}` : '');

    button.append(name, meta);
    button.addEventListener('click', () => select(table.id));
    button.addEventListener('mouseenter', () => send({ type: 'highlight', id: table.id }));
    button.addEventListener('focus', () => send({ type: 'highlight', id: table.id }));

    li.append(button);
    els.list.append(li);
  });

  els.picker.hidden = false;
}

function renderPreview(data) {
  const { headers, rows, columnCount } = data;
  els.preview.replaceChildren();

  if (headers) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach((header, i) => {
      const th = document.createElement('th');
      th.textContent = header || `Column ${i + 1}`;
      th.title = th.textContent;
      tr.append(th);
    });
    thead.append(tr);
    els.preview.append(thead);
  }

  const tbody = document.createElement('tbody');
  rows.slice(0, PREVIEW_ROWS).forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      td.title = cell;
      tr.append(td);
    });
    tbody.append(tr);
  });
  els.preview.append(tbody);

  const hidden = Math.max(rows.length - PREVIEW_ROWS, 0);
  els.previewMeta.textContent =
    `${rows.length} × ${columnCount}` + (hidden ? ` — showing first ${PREVIEW_ROWS} rows` : '');
  els.previewPanel.hidden = false;
  els.footer.hidden = false;
}

/* -------------------------------------------------------------------- *
 * Actions
 * -------------------------------------------------------------------- */

async function select(id) {
  for (const button of els.list.querySelectorAll('.table-item')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.id) === id));
  }
  await send({ type: 'highlight', id, scroll: true });

  const response = await send({ type: 'extract', id });
  if (!response.ok) {
    showStatus(response.error || 'Could not read that table.', true);
    return;
  }
  selected = { id, data: response.data };
  renderPreview(response.data);
}

function currentFormat() {
  return FORMATS[els.format.value] || FORMATS.csv;
}

function serializeSelection() {
  const format = currentFormat();
  return format.serialize(selected.data);
}

function onDownload() {
  if (!selected) return;
  const format = currentFormat();
  const blob = new Blob([serializeSelection()], { type: format.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildFilename(
    selected.data.pageTitle,
    selected.data.name,
    format.extension
  );
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast(`Saved as ${link.download}`);
}

async function onCopy() {
  if (!selected) return;
  try {
    await navigator.clipboard.writeText(serializeSelection());
    toast(`${currentFormat().label} copied to clipboard`);
  } catch (error) {
    toast('Copy failed — try Download instead.');
  }
}

async function scan() {
  els.picker.hidden = true;
  els.previewPanel.hidden = true;
  els.footer.hidden = true;
  selected = null;
  showStatus('Scanning this page…');

  const response = await send({ type: 'scan' });
  if (!response.ok) {
    showStatus(response.error || 'Could not scan this page.', true);
    return;
  }
  if (!response.tables.length) {
    showStatus('No tables found on this page.');
    return;
  }

  els.status.hidden = true;
  renderList(response.tables);
  if (response.tables.length === 1) await select(response.tables[0].id);
}

/* -------------------------------------------------------------------- *
 * Startup
 * -------------------------------------------------------------------- */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showStatus('No active tab.', true);
    return;
  }
  tabId = tab.id;

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['src/content/content.js']
    });
  } catch (error) {
    showStatus(
      'This page is off limits to extensions. Try it on a regular website — Chrome blocks chrome:// pages, the Web Store and other extensions.',
      true
    );
    return;
  }

  // Lifetime signal: when the popup closes this port disconnects and the
  // content script removes its highlight from the page.
  port = chrome.tabs.connect(tabId, { name: 'table-extractor' });

  await scan();
}

els.rescan.addEventListener('click', scan);
els.download.addEventListener('click', onDownload);
els.copy.addEventListener('click', onCopy);
els.format.addEventListener('change', () => {
  if (selected) toast(`Format: ${currentFormat().label}`);
});

init();
