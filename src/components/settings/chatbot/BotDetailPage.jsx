import React, { useState } from 'react';
import { ArrowLeft, Settings, History, Brain } from 'lucide-react';
import BotSettingsTab from './BotSettingsTab';
import ConversationsTab from './ConversationsTab';
import MemoriesTab from './MemoriesTab';

const TABS = [
  { key: 'settings', label: 'Bot Settings', icon: Settings },
  { key: 'conversations', label: 'Conversations', icon: History },
  { key: 'memories', label: 'Memories', icon: Brain },
];

export default function BotDetailPage({ botKey, botName, onBack }) {
  const [tab, setTab] = useState('settings');

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <div className="text-[16px] font-semibold text-foreground">{botName}</div>
      </div>

      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'settings' && <BotSettingsTab botKey={botKey} />}
      {tab === 'conversations' && <ConversationsTab mode={botKey} />}
      {tab === 'memories' && <MemoriesTab />}
    </div>
  );
}