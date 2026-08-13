import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Database, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function ConversationsTab({ mode }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations', mode],
    queryFn: () => base44.entities.ChatConversation.filter({ active: true, mode }, '-last_message_at', 50),
  });

  const archive = async (c) => {
    await base44.entities.ChatConversation.update(c.id, { active: false });
    qc.invalidateQueries({ queryKey: ['chat-conversations', mode] });
    toast.success('Conversation archived');
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ts; }
  };

  const botName = mode === 'build' ? 'BuildBot' : 'DataBot';

  return (
    <div>
      <div className="text-[13px] text-muted-foreground mb-4">
        Conversation history for {botName}. The bot remembers past conversations for continuity and context.
      </div>
      {conversations.length === 0 ? (
        <div className="text-center text-muted-foreground text-[13px] py-10 border border-dashed border-border rounded-[12px]">
          No conversations yet. Start chatting with {botName} to see your history here.
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => {
            let msgs = [];
            try { msgs = JSON.parse(c.messages || '[]'); } catch {}
            const isExpanded = expanded === c.id;
            return (
              <div key={c.id} className="bg-card border border-border rounded-[12px] overflow-hidden">
                <button onClick={() => setExpanded(isExpanded ? null : c.id)} className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {mode === 'build' ? <Zap className="w-4 h-4 text-primary" /> : <Database className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">{c.title || 'Untitled conversation'}</div>
                    <div className="text-[11px] text-muted-foreground">{c.message_count} messages · {fmtTime(c.last_message_at)}</div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1.5 max-h-[300px] overflow-y-auto border-t border-border pt-3">
                    {msgs.map((m, i) => (
                      <div key={i} className={`text-[12px] ${m.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}`}>
                        <span className="font-medium text-[10px] uppercase tracking-wide mr-2">{m.role === 'user' ? 'You' : botName}</span>
                        <span className="whitespace-pre-wrap">{typeof m.content === 'string' ? m.content.slice(0, 500) : ''}</span>
                      </div>
                    ))}
                    <button onClick={() => archive(c)} className="text-[11px] text-muted-foreground hover:text-destructive mt-2">Archive</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}