import { useResizableWidth } from './useResizableWidth';

// Main sidebar width. Drag to make it slightly smaller or a bit larger.
// Mirrors onto the --sidebar-width CSS var so AppLayout's content margin stays in sync.
export function useSidebarWidth() {
  return useResizableWidth({
    storageKey: 'legenex_sidebar_width',
    defaultWidth: 248,
    min: 208,
    max: 320,
    cssVar: '--sidebar-width',
  });
}