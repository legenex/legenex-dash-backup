import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePermissions } from '@/lib/AuthContext';
import { Database, Zap, BookOpen, MessageSquare, ArrowRight } from 'lucide-react';
import KnowledgeBasePanel from './chatbot/KnowledgeBasePanel';
import BotDetailPage from './chatbot/BotDetailPage';

export default function SettingsChatBot() {
  const { can } = usePermissions();
  const [selectedBot, setSelectedBot] = useState(null);

  const { data: configs = [] } = useQuery({
    queryKey: ['bot-configs'],
    queryFn: () => base44.entities.BotConfig.list(),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations-all'],
    queryFn: () => base44.entities.ChatConversation.filter({ active: true }, '-last_message_at', 100),
  });

  const { data: docs = [] } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDoc.list('sort_order'),
  });

  if (selectedBot) {
    const cfg = configs.find(c => c.bot_key === selectedBot) || {};
    const name = cfg.name || (selectedBot === 'build' ? 'BuildBot' : 'DataBot');
    return <BotDetailPage botKey={selectedBot} botName={name} onBack={() => setSelectedBot(null)} />;
  }

  const showData = can('databot');
  const showBuild = can('buildbot');

  const bots = [
    { key: 'data', defaultName: 'DataBot', tagline: 'Answers about your data + knowledge base', icon: Database, perm: showData },
    { key: 'build', defaultName: 'BuildBot', tagline: 'Drafts app changes for the safe build channel', icon: Zap, perm: showBuild },
  ].filter(b => b.perm);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {bots.map(b => {
          const cfg = configs.find(c => c.bot_key === b.key) || {};
          const name = cfg.name || b.defaultName;
          const tagline = cfg.tagline || b.tagline;
          const enabled = cfg.enabled !== false;
          const convCount = conversations.filter(c => c.mode === b.key).length;
          const Icon = b.icon;
          return (
            <button key={b.key} onClick={() => setSelectedBot(b.key)} className="text-left rounded-[12px] border border-border bg-card p-5 hover:bg-accent/30 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {cfg.avatar_url ? <img src={cfg.avatar_url} alt={name} className="w-12 h-12 rounded-xl object-cover" /> : <Icon className="w-6 h-6 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${enabled ? 'bg-status-sold status-sold' : 'bg-status-error status-error'}`}>{enabled ? 'LIVE' : 'OFF'}</span>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{tagline}</div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {convCount} conversations</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><BookOpen className="w-3 h-3" /> {docs.filter(d => d.active).length} KB items</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-[12px] border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-primary" />
          <div>
            <div className="text-[15px] font-semibold text-foreground">Knowledge Base</div>
            <div className="text-[12px] text-muted-foreground">Shared context for both bots. Add docs, upload files, or generate with AI.</div>
          </div>
        </div>
        <KnowledgeBasePanel />
      </div>
    </div>
  );
}