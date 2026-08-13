import React, { useRef, useMemo, useEffect } from 'react';

export function HighlightedPayloadEditor({ value, onChange, minHeight = 340, textClass = 'text-[11px]', className = '' }) {
  const taRef = useRef(null);
  const preRef = useRef(null);

  const highlighted = useMemo(() => {
    let html = String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/\{\{[\w.]+(?:\|[\w]+)*\}\}/g, match =>
      `<span style="color: hsl(var(--primary))">${match}</span>`
    );
    return html;
  }, [value]);

  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    syncScroll();
  }, [value]);

  return (
    <div
      className={`relative rounded-md border border-input bg-background overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`absolute inset-0 m-0 overflow-hidden p-3 font-mono ${textClass} leading-relaxed whitespace-pre-wrap break-all pointer-events-none`}
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        className={`absolute inset-0 w-full h-full p-3 font-mono ${textClass} leading-relaxed whitespace-pre-wrap break-all bg-transparent outline-none resize-none`}
        style={{ color: 'transparent', caretColor: 'hsl(var(--foreground))' }}
      />
    </div>
  );
}

export default HighlightedPayloadEditor;