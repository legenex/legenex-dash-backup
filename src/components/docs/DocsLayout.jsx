import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { DOCS_SECTIONS } from './docsConfig';
import { BookOpen, ArrowUpRight } from 'lucide-react';

// Public docs shell: its own left sidebar + content area, Legenex dark theme.
// Not wrapped by the operator AppLayout, renders for anonymous visitors.
export default function DocsLayout() {
  const { pathname } = useLocation();
  const current = pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '');

  return (
    <div className="dark min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar hidden md:flex flex-col fixed inset-y-0 left-0">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <BookOpen className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-heading font-bold text-foreground">Legenex</div>
            <div className="text-[11px] text-muted-foreground">Docs</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {DOCS_SECTIONS.map(group => (
            <div key={group.group}>
              <div className="px-2.5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const active = current === item.slug;
                  return (
                    <Link
                      key={item.slug || 'overview'}
                      to={`/docs${item.slug ? `/${item.slug}` : ''}`}
                      className={`block px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                        active
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'
                      }`}
                    >
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border">
          <a
            href="https://dashboard.legenex.com"
            className="flex items-center justify-between px-2.5 py-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            Go to Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 md:pl-64 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}