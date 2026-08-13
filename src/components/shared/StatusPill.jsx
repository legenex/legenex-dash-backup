import React from 'react';
import { statusTagClass } from '@/lib/tagColors';

export default function StatusPill({ status, size = 'sm' }) {
  const base = statusTagClass(status);
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-[13px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${base} ${sizeClass}`}>
      {status}
    </span>
  );
}