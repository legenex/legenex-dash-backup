import { useState, useEffect, useCallback } from 'react';

// Lightweight theme manager (System / Light / Dark) without external deps.
// Applies the `dark` class on <html> and persists the choice to localStorage.
const KEY = 'legenex_theme';
const listeners = new Set();

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getStoredTheme() {
  try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; }
}

export function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

export function setStoredTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch {}
  applyTheme(theme);
  listeners.forEach(l => l(theme));
}

// Apply once on load and react to OS changes while on "system".
applyTheme(getStoredTheme());
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    const l = (t) => setThemeState(t);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);

  const setTheme = useCallback((t) => setStoredTheme(t), []);
  return { theme, setTheme };
}