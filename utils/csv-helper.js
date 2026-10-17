const fs = require('node:fs');
const path = require('node:path');

function dhakaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function saveStatementCsv(headers, rows, outputDir = path.resolve('output')) {
  if (!headers.length) throw new Error('Self Statement table has no headers.');
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `self_statement_${dhakaDate()}.csv`);
  const contents = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(filePath, contents, { encoding: 'utf8' });
  if (!fs.existsSync(filePath)) throw new Error(`CSV was not created: ${filePath}`);
  return { filePath, contents: fs.readFileSync(filePath, 'utf8') };
}

module.exports = { csvCell, dhakaDate, saveStatementCsv };
