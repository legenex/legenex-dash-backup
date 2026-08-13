import React from 'react';

export default function JsonViewer({ data, title }) {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { parsed = data; }
  }

  return (
    <div>
      {title && <div className="text-[12px] font-medium text-muted-foreground mb-2">{title}</div>}
      <pre className="bg-background rounded-lg border border-border p-4 text-[12px] font-mono text-foreground overflow-x-auto overflow-y-auto max-h-[400px] max-w-full leading-relaxed">
        {typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}