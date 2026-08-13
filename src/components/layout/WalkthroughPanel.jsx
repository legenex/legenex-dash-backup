import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { walkthroughGuide } from '@/functions/walkthroughGuide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Compass, X, Send, Loader2 } from 'lucide-react';

// AI-guided onboarding side panel. Uses the walkthroughGuide backend function
// (InvokeLLM, claude_sonnet_4_6) to teach setup step by step.
export default function WalkthroughPanel({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && !started) {
      setStarted(true);
      send([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (history) => {
    setLoading(true);
    try {
      const res = await walkthroughGuide({ messages: history });
      const reply = res?.data?.reply || 'Sorry, I could not load the walkthrough right now.';
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch {
      setMessages([...history, { role: 'assistant', content: 'Something went wrong loading the walkthrough. Please try again.' }]);
    }
    setLoading(false);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    send(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-card border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Compass className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-foreground">Walk Through</div>
              <div className="text-[11px] text-muted-foreground">AI-guided platform setup</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-foreground'
              }`}>
                {m.role === 'user'
                  ? m.content
                  : <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&_ul]:my-1 [&_p]:my-1 [&_li]:my-0.5">{m.content}</ReactMarkdown>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-accent/50 rounded-xl px-3.5 py-2.5 text-[13px] text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question or say 'next'…"
            className="bg-background text-[13px]"
            disabled={loading}
          />
          <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}