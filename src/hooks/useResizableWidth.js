import { useState, useEffect, useCallback, useRef } from 'react';

// Generic horizontal resize hook. Persists width to localStorage under `storageKey`,
// clamps between min/max, and optionally mirrors the value onto a CSS variable so
// other consumers (e.g. a layout margin) stay in sync.
export function useResizableWidth({ storageKey, defaultWidth, min, max, cssVar = null }) {
  const load = useCallback(() => {
    try {
      const v = parseInt(localStorage.getItem(storageKey), 10);
      if (!Number.isNaN(v)) return Math.min(max, Math.max(min, v));
    } catch {}
    return defaultWidth;
  }, [storageKey, defaultWidth, min, max]);

  const [width, setWidth] = useState(load);
  const draggingRef = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    if (cssVar && typeof document !== 'undefined') {
      document.documentElement.style.setProperty(cssVar, `${width}px`);
    }
  }, [width, cssVar]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    // The element's left edge in viewport coords lets us convert mouse X → width.
    const originLeft = e.currentTarget.closest('[data-resize-origin]')?.getBoundingClientRect().left ?? 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const next = Math.min(max, Math.max(min, ev.clientX - originLeft));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(storageKey, String(widthRef.current)); } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [storageKey, min, max]);

  return { width, startResize };
}