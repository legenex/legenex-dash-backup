// Minimal CSV export helper.
export function downloadCsv(filename, columns, rows) {
  const header = columns.map(c => `"${String(c.label).replace(/"/g, '""')}"`).join(',');
  const body = rows.map(r =>
    columns.map(c => {
      const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
      return `"${String(v ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}