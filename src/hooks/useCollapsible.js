import { useState, useCallback, useEffect } from 'react';

// Persisted boolean collapse state. Remembers the user's preference in
// localStorage under `storageKey` and, when `cssVar` is provided, mirrors a
// width onto that CSS variable so a layout margin can follow the collapsed
// vs. expanded state.
export function useCollapsible({ storageKey, defaultCollapsed = false, cssVar = null, collapsedWidth = 0, expandedWidth = 0 }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {}
    return defaultCollapsed;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(collapsed)); } catch {}
    if (cssVar && typeof document !== 'undefined') {
      document.documentElement.style.setProperty(cssVar, `${collapsed ? collapsedWidth : expandedWidth}px`);
    }
  }, [collapsed, storageKey, cssVar, collapsedWidth, expandedWidth]);

  const toggle = useCallback(() => setCollapsed(c => !c), []);

  return { collapsed, toggle, setCollapsed };
}