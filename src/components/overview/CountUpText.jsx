import React from 'react';
import useCountUp from '@/hooks/useCountUp';

// Renders a value that counts up from 0 to `value` on mount.
// `render(n)` formats the animated number (e.g. money, int, "x/10 fresh").
export default function CountUpText({ value, render = (n) => Math.round(n), className = '' }) {
  const animated = useCountUp(value ?? 0);
  return <span className={className}>{render(animated)}</span>;
}