import { useEffect, useRef, useState } from 'react';

// Pull-to-refresh for a mobile scroll container. Additive, no dependency.
//
// Engages only when the container is scrolled to the top and the finger drags
// downward past a 70px threshold. Shows a pull distance the caller can render
// as a spinner, calls the async onRefresh, then resets.
//
// No-ops entirely at lg and up, and on fine-pointer (mouse) devices, so the
// desktop experience is untouched.
const THRESHOLD = 70;
const MAX_PULL = 110;

export function usePullToRefresh(scrollRef, onRefresh, { enabled = true } = {}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    // Desktop / mouse devices: never engage.
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    const finePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
    if (isDesktop || finePointer) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onTouchStart = (e) => {
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        dragging.current = true;
      }
    };

    const onTouchMove = (e) => {
      if (!dragging.current || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && el.scrollTop <= 0) {
        // Dampen the pull so it feels rubbery, unless reduced motion is on.
        const distance = reducedMotion ? Math.min(delta, MAX_PULL) : Math.min(delta * 0.5, MAX_PULL);
        setPull(distance);
      } else {
        dragging.current = false;
        setPull(0);
      }
    };

    const onTouchEnd = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await onRefresh?.();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [scrollRef, onRefresh, enabled, pull, refreshing]);

  return { pull, refreshing, threshold: THRESHOLD };
}