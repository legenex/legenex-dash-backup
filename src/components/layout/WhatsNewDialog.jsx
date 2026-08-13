import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const FALLBACK = {
  version: 'v1.0.0',
  date: 'Current release',
  items: [
    'Lead Distribution sub-sidebar for quick moves between Dashboard, Campaigns, Deliveries and Conversion Events.',
    'Profile menu at the sidebar bottom with theme switcher, settings and help.',
    'AI-guided Walk Through to help you set up the platform step by step.',
    'New Profile settings page, edit your name, email, timezone and Gmail connection.',
  ],
};

export default function WhatsNewDialog({ open, onOpenChange }) {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || release) return;
    setLoading(true);
    base44.functions
      .invoke('whatsNew', {})
      .then((res) => setRelease(res?.data?.release || FALLBACK))
      .catch(() => setRelease(FALLBACK))
      .finally(() => setLoading(false));
  }, [open, release]);

  const r = release || FALLBACK;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> What's New
          </DialogTitle>
          <DialogDescription>Latest updates and improvements to Legenex DashFlo.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating highlights…
          </div>
        ) : (
          <div className="space-y-5 max-h-[60vh] overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] font-semibold text-foreground">{r.version}</span>
                <span className="text-[11px] text-muted-foreground">· Current release</span>
              </div>
              <ul className="space-y-1.5">
                {r.items.map((it, i) => (
                  <li key={i} className="text-[13px] text-muted-foreground flex gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}