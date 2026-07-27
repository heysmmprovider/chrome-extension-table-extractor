/**
 * Serialisers for an extracted table.
 *
 * Every function takes `{ headers, rows }` where `headers` is a string[] or
 * null, and `rows` is a string[][] of equal-length rows.
 */

/** Column labels that are safe to use as JSON keys: non-empty and unique. */
export function normalizeHeaders(headers, columnCount) {
  const source = headers && headers.length ? headers : [];
  const seen = new Map();
  const out = [];
  for (let i = 0; i < columnCount; i++) {
    let name = (source[i] || '').replace(/\s+/g, ' ').trim() || `column_${i + 1}`;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      name = `${name}_${n}`;
    } else {
      seen.set(name, 1);
    }
    out.push(name);
  }
  return out;
}

function escapeDelimited(value, delimiter) {
  const text = value == null ? '' : String(value);
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r');
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV (or TSV when the delimiter is a tab). */
export function toDelimited({ headers, rows }, delimiter = ',') {
  const lines = [];
  if (headers) lines.push(headers.map((h) => escapeDelimited(h, delimiter)).join(delimiter));
  for (const row of rows) {
    lines.push(row.map((cell) => escapeDelimited(cell, delimiter)).join(delimiter));
  }
  return lines.join('\r\n');
}

/**
 * Array of objects when the table has headers, array of arrays otherwise.
 */
export function toJSON({ headers, rows, columnCount }) {
  if (!headers) return JSON.stringify(rows, null, 2);
  const keys = normalizeHeaders(headers, columnCount);
  const objects = rows.map((row) => {
    const obj = {};
    keys.forEach((key, i) => {
      obj[key] = row[i] ?? '';
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

export function toMarkdown({ headers, rows, columnCount }) {
  const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|');
  const head = headers || Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  const lines = [
    `| ${head.map(escapeCell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`
  ];
  for (const row of rows) lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Standalone HTML document — opens straight into Excel, Sheets or a browser. */
export function toHTML({ headers, rows, name }) {
  const title = escapeHtml(name || 'Table');
  const thead = headers
    ? `  <thead>\n    <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>\n  </thead>\n`
    : '';
  const tbody = rows
    .map((row) => `    <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 10px; text-align: left; }
  th { background: #f4f4f5; }
</style>
<h1>${title}</h1>
<table>
${thead}  <tbody>
${tbody}
  </tbody>
</table>
`;
}

export const FORMATS = {
  csv: {
    label: 'CSV',
    extension: 'csv',
    mime: 'text/csv;charset=utf-8',
    serialize: (data) => toDelimited(data, ',')
  },
  tsv: {
    label: 'TSV',
    extension: 'tsv',
    mime: 'text/tab-separated-values;charset=utf-8',
    serialize: (data) => toDelimited(data, '\t')
  },
  json: {
    label: 'JSON',
    extension: 'json',
    mime: 'application/json;charset=utf-8',
    serialize: toJSON
  },
  markdown: {
    label: 'Markdown',
    extension: 'md',
    mime: 'text/markdown;charset=utf-8',
    serialize: toMarkdown
  },
  html: {
    label: 'HTML',
    extension: 'html',
    mime: 'text/html;charset=utf-8',
    serialize: toHTML
  }
};

/** Turns a page title and table name into a safe, readable file name. */
export function buildFilename(pageTitle, tableName, extension) {
  const slug = (value) =>
    (value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

  const parts = [slug(pageTitle), slug(tableName)].filter(Boolean);
  const base = [...new Set(parts)].join('-') || 'table';
  return `${base}.${extension}`;
}
