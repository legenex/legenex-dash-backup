import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ChevronsUpDown, Monitor, Sun, Moon, Settings as SettingsIcon,
  Sparkles, Compass, HelpCircle, LogOut, BookOpen,
} from 'lucide-react';
import WalkthroughPanel from './WalkthroughPanel';
import WhatsNewDialog from './WhatsNewDialog';

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const THEMES = [
  { key: 'system', label: 'System', icon: Monitor },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
];

// Profile card + upward popup menu at the sidebar bottom.
export default function SidebarProfile() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [walkOpen, setWalkOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);

  const name = user?.full_name || 'User';
  const email = user?.email || '';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent transition-colors text-left">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials(name, email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-foreground truncate">{name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{email}</div>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-[224px] mb-1">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Theme</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border">
              {THEMES.map(t => {
                const Icon = t.icon;
                const active = theme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={(e) => { e.preventDefault(); setTheme(t.key); }}
                    aria-label={t.label}
                    title={t.label}
                    className={`p-1.5 rounded-md transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings?tab=profile')} className="text-[13px] cursor-pointer gap-2">
            <SettingsIcon className="w-4 h-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNewsOpen(true)} className="text-[13px] cursor-pointer gap-2">
            <Sparkles className="w-4 h-4" /> What's New
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setWalkOpen(true)} className="text-[13px] cursor-pointer gap-2">
            <Compass className="w-4 h-4" /> Walk Through
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.open('https://docs.legenex.com', '_blank', 'noopener,noreferrer')}
            className="text-[13px] cursor-pointer gap-2"
          >
            <BookOpen className="w-4 h-4" /> Documentation
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.open('https://docs.legenex.com', '_blank', 'noopener,noreferrer')}
            className="text-[13px] cursor-pointer gap-2"
          >
            <HelpCircle className="w-4 h-4" /> Get Help
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()} className="text-[13px] cursor-pointer gap-2 text-primary">
            <LogOut className="w-4 h-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WalkthroughPanel open={walkOpen} onClose={() => setWalkOpen(false)} />
      <WhatsNewDialog open={newsOpen} onOpenChange={setNewsOpen} />
    </>
  );
}