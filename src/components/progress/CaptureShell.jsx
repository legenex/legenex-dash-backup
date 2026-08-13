import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';

// The visual chrome of the operator app, for screenshots only.
//
// A capture that shows only the page body is not what anyone reviews. The
// sidebar, the section sub-menu and the page all have to be in the frame,
// because half the things worth commenting on live in the navigation.
//
// This deliberately does NOT mount AppLayout, even though AppLayout is what
// draws this chrome in the real app. AppLayout runs useMetaAutoSync, which calls
// syncMetaSpend on mount when the last sync is older than fifteen minutes.
// Mounting it once per page across a sixty page batch would fire that repeatedly
// and write ad spend rows. So the layout is reproduced here without the effects:
// the same Sidebar component, the same content margin, and nothing that touches
// the network or the database.
//
// Kept in step with AppLayout by hand. If AppLayout's shell changes, this needs
// the same change, and the screenshots are the thing that will show it.

export default function CaptureShell() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-[var(--sidebar-width,248px)]">
        <div className="app-scroll p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
