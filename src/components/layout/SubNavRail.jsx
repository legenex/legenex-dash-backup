import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

// A single rail entry, a Link when it has a `to`, otherwise a callback button.
function RailItem({ item, activeRef }) {
  const cls = "relative flex items-center whitespace-nowrap text-[12px] px-2.5 font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  const inner = (
    <>
      <span className={item.active ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
      {item.active && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-primary" />}
    </>
  );
  if (item.to) {
    return <Link to={item.to} ref={item.active ? activeRef : undefined} className={cls}>{inner}</Link>;
  }
  return <button type="button" onClick={item.onClick} ref={item.active ? activeRef : undefined} className={cls}>{inner}</button>;
}

// Mobile-only horizontal scrolling rail for a section sub-nav.
// Rendered below the lg breakpoint in place of the vertical SubNavShell column.
// items: [{ label, to, active }]. Renders nothing when there is only one item.
export default function SubNavRail({ items = [] }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  const activeKey = items.find(i => i.active)?.to;

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeKey]);

  if (items.length <= 1) return null;

  return (
    <div className="lg:hidden relative sticky top-[52px] z-20 bg-background/95 backdrop-blur border-b border-border shrink-0" style={{ height: '40px' }}>
      <div
        ref={scrollRef}
        className="h-full flex items-stretch overflow-x-auto no-scrollbar"
      >
        {items.map((item, i) => (
          <RailItem key={item.to || item.label || i} item={item} activeRef={activeRef} />
        ))}
      </div>
      {/* Right edge fade to hint scrollability */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 right-0"
        style={{ width: '28px', background: 'linear-gradient(to right, transparent, hsl(var(--background)))' }}
      />
    </div>
  );
}