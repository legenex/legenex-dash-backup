import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

// Shared section layout: a full-width header region spanning the top, with a
// row of [ side menu | page content ] directly below it.
//
// Pages that live inside a SectionShell render <SectionHeader> instead of
// <PageHeader>. SectionHeader portals its content into the full-width header
// slot above the sub-menu-and-content row, so the header always spans the full
// width while the resizable side menu (SubNavShell) sits beside the content.
//
// Any future section can adopt this simply by wrapping its sub-nav + Outlet in
// <SectionShell nav={<XyzNav />}>.

const SectionHeaderContext = createContext(null);

// Rendered by a page to place its header content into the shell's full-width
// header slot. Falls back to inline rendering if used outside a SectionShell.
export function SectionHeaderSlot({ children }) {
  const headerNode = useContext(SectionHeaderContext);
  if (!headerNode) return <>{children}</>;
  return createPortal(children, headerNode);
}

export default function SectionShell({ nav, children }) {
  const [headerNode, setHeaderNode] = useState(null);

  // Callback ref keeps the portal target in sync with the mounted DOM node.
  const headerRef = (node) => setHeaderNode(prev => (prev === node ? prev : node));

  return (
    <SectionHeaderContext.Provider value={headerNode}>
      <div className="h-full flex flex-col min-h-0">
        {/* Full-width header region, pages portal their header here. */}
        <div ref={headerRef} className="shrink-0" />
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-3 lg:items-stretch">
          {nav}
          <div className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </div>
      </div>
    </SectionHeaderContext.Provider>
  );
}