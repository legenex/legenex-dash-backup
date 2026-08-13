import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { dataBot } from '@/functions/dataBot';
import { usePermissions } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, X, Send, Loader2, Copy, Hammer, ArrowLeft, MessageSquare, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { verdictTagClass } from '@/lib/tagColors';
import ReactMarkdown from 'react-markdown';

// Track the current conversation ID per bot mode so the backend can persist
// messages into the right ChatConversation thread.
const conversationIds = { data: null, build: null };

// Screenshot attachments. The backend takes { media_type, data } with data
// base64 encoded; preview is the full data URL and stays in the browser only.
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const fileToImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const res = String(reader.result || '');
    const comma = res.indexOf(',');
    resolve({
      media_type: file.type || 'image/png',
      data: comma >= 0 ? res.slice(comma + 1) : res,
      preview: res,
      name: file.name || 'screenshot',
    });
  };
  reader.onerror = () => reject(new Error('Could not read that image'));
  reader.readAsDataURL(file);
});

function BuildCard({ build }) {
  const copy = () => { navigator.clipboard.writeText(build.ready_prompt || ''); toast.success('Build request copied'); };
  const riskVerdict = build.risk === 'red' ? 'fail' : build.risk === 'amber' ? 'warn' : 'pass';
  return (
    <div className="max-w-[95%] rounded-[12px] border border-border bg-card p-3 text-[13px] text-foreground">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Build request (draft)</span>
        {build.risk && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${verdictTagClass(riskVerdict)}`}>{build.risk}</span>
        )}
      </div>
      {build.title && <div className="mt-1 font-semibold">{build.title}</div>}
      {build.summary && <p className="mt-1 text-muted-foreground">{build.summary}</p>}
      {Array.isArray(build.target_files) && build.target_files.length > 0 && (
        <div className="mt-2 text-[11px]"><span className="text-muted-foreground">Target: </span><span className="font-mono break-all">{build.target_files.join(', ')}</span></div>
      )}
      {Array.isArray(build.do_not_touch) && build.do_not_touch.length > 0 && (
        <div className="mt-1 text-[11px]"><span className="text-muted-foreground">Do not touch: </span><span className="font-mono break-all">{build.do_not_touch.join(', ')}</span></div>
      )}
      {build.ready_prompt && (
        <div className="mt-2 rounded-md border border-border bg-popover p-2 text-[11px] font-mono text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">{build.ready_prompt}</div>
      )}
      <div className="mt-2">
        <Button size="sm" onClick={copy} className="gap-1.5 h-7 text-[12px]"><Copy className="w-3.5 h-3.5" />Copy build request</Button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">BuildBot drafts changes, it does not apply them. Paste this to Claude, the Base44 builder, or Claude Code to execute.</p>
    </div>
  );
}

const BOTS = {
  data: {
    name: 'DataBot',
    tagline: 'Answers about your data + knowledge base',
    greeting: "Hi, I'm **DataBot**. Ask me about your leads, performance, and knowledge base. I only see your own account's data.",
    placeholder: 'Ask about your data\u2026',
    suggestions: ['How many leads sold today?', 'Which supplier has the best conversion?', 'Summarize my ad spend vs revenue'],
  },
  build: {
    name: 'BuildBot',
    tagline: 'Drafts app changes for the safe build channel',
    greeting: "Hi, I'm **BuildBot**. Describe a change and I'll draft a ready-to-run build request. I don't apply changes myself; you hand the draft to the build channel.",
    placeholder: 'Describe a change\u2026',
    suggestions: ['Add a CSV export button to the Leads page', 'Add a status filter to the Suppliers table', 'Create a Reports tab for returns'],
  },
};

export default function DataBotWidget() {
  const { can } = usePermissions();
  const showData = can('databot');
  const showBuild = can('buildbot');
  const [open, setOpen] = useState(false);
  const [activeBot, setActiveBot] = useState(null); // null = picker
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]); // screenshots attached but not yet sent
  const [busy, setBusy] = useState(false);
  const [threads, setThreads] = useState({ data: [], build: [] });
  const { data: configs = [] } = useQuery({ queryKey: ['bot-configs'], queryFn: () => base44.entities.BotConfig.list(), staleTime: 60000 });
  const scrollRef = useRef(null);
  // Ref mirror so the bridge event handler (which captures a stale closure)
  // always sees the latest threads instead of wiping history.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const fileInputRef = useRef(null);

  const messages = activeBot ? threads[activeBot] : [];
  const cfg = activeBot ? (() => {
    const dbCfg = configs.find(c => c.bot_key === activeBot);
    const base = BOTS[activeBot];
    if (!dbCfg) return base;
    return {
      ...base,
      name: dbCfg.name || base.name,
      tagline: dbCfg.tagline || base.tagline,
      greeting: dbCfg.greeting || base.greeting,
    };
  })() : null;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, activeBot, open]);

  // Listen for cross-component "Ask AI" requests (e.g. from the AI Analyst band).
  useEffect(() => {
    const handler = (e) => {
      const question = e?.detail?.question;
      if (!question) return;
      setOpen(true);
      // Always route to DataBot for analytics questions.
      const bot = showData ? 'data' : (showBuild ? 'build' : null);
      if (!bot) return;
      setActiveBot(bot);
      setThreads((t) => (t[bot].length ? t : { ...t, [bot]: [{ role: 'assistant', content: BOTS[bot].greeting }] }));
      // Defer the send so state updates (open + activeBot) settle first.
      setTimeout(() => sendToBot(bot, question), 50);
    };
    window.addEventListener('databot-open', handler);
    return () => window.removeEventListener('databot-open', handler);
  }, [showData, showBuild]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length) return;
    const room = MAX_IMAGES - pendingRef.current.length;
    if (room <= 0) { toast.error(`You can attach up to ${MAX_IMAGES} screenshots.`); return; }
    const take = files.slice(0, room);
    const ok = take.filter((f) => f.size <= MAX_IMAGE_BYTES);
    if (ok.length < take.length) toast.error('Each image must be under 5MB.');
    if (!ok.length) return;
    try {
      const loaded = await Promise.all(ok.map(fileToImage));
      setPending((ps) => [...ps, ...loaded].slice(0, MAX_IMAGES));
    } catch {
      toast.error('Could not read that image.');
    }
  };

  // Paste a screenshot anywhere while the panel is open, which is how people
  // actually share a screen grab. The file picker is the explicit fallback.
  useEffect(() => {
    if (!open || !activeBot) return undefined;
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type?.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, activeBot]);

  if (!showData && !showBuild) return null;

  const openBot = (bot) => {
    setActiveBot(bot);
    setThreads((t) => (t[bot].length ? t : { ...t, [bot]: [{ role: 'assistant', content: BOTS[bot].greeting }] }));
  };

  const sendToBot = async (bot, text) => {
    const question = (text ?? input).trim();
    const pics = pendingRef.current;
    if ((!question && !pics.length) || busyRef.current || !bot) return;
    const current = threadsRef.current[bot] || [];
    const next = [...current, { role: 'user', content: question, images: pics.map((p) => p.preview) }];
    setThreads((t) => ({ ...t, [bot]: next }));
    if (bot === activeBot) { setInput(''); setPending([]); }
    setBusy(true);
    busyRef.current = true;
    try {
      // Previews are stripped from history: they are large data URLs and the
      // backend only needs the images attached to THIS message.
      const history = next.slice(-8).map(({ images: _drop, ...m }) => m);
      const res = await dataBot({
        question,
        history,
        mode: bot,
        conversation_id: conversationIds[bot],
        images: pics.map(({ media_type, data }) => ({ media_type, data })),
      });
      const data = res?.data || {};
      if (data.conversation_id) conversationIds[bot] = data.conversation_id;
      const msg = (data.type === 'build_request' && data.build_request)
        ? { role: 'assistant', type: 'build_request', build: data.build_request }
        : { role: 'assistant', content: data.answer || data.error || 'Sorry, I could not answer that.' };
      setThreads((t) => ({ ...t, [bot]: [...t[bot], msg] }));
    } catch (e) {
      setThreads((t) => ({ ...t, [bot]: [...t[bot], { role: 'assistant', content: 'Something went wrong reaching the assistant. Please try again.' }] }));
    }
    setBusy(false);
    busyRef.current = false;
  };

  const send = (text) => sendToBot(activeBot, text);

  return (
    <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-5 lg:bottom-5 z-[60]">
      {open && (
        <div className="mb-3 w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-popover border border-border rounded-[16px] shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              {activeBot ? (
                <button onClick={() => setActiveBot(null)} className="text-muted-foreground hover:text-foreground" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Bot className="w-4.5 h-4.5 text-primary" /></div>
              )}
              <div>
                <div className="text-[14px] font-semibold text-foreground leading-tight">{cfg ? cfg.name : 'Assistants'}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{cfg ? cfg.tagline : 'Choose an assistant'}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>

          {!activeBot ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <p className="text-[12px] text-muted-foreground">Pick an assistant to get started.</p>
              {showData && (
                <button onClick={() => openBot('data')} className="w-full text-left rounded-[12px] border border-border bg-card p-3 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /><span className="text-[13px] font-semibold text-foreground">DataBot</span></div>
                  <p className="mt-1 text-[12px] text-muted-foreground">Ask questions about your data and the knowledge base. Scoped to your account.</p>
                </button>
              )}
              {showBuild && (
                <button onClick={() => openBot('build')} className="w-full text-left rounded-[12px] border border-border bg-card p-3 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-2"><Hammer className="w-4 h-4 text-primary" /><span className="text-[13px] font-semibold text-foreground">BuildBot</span></div>
                  <p className="mt-1 text-[12px] text-muted-foreground">Describe a change; get a ready-to-run build request for the safe build channel.</p>
                </button>
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] bg-primary text-primary-foreground">
                        {Array.isArray(m.images) && m.images.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {m.images.map((src, k) => (
                              <img key={k} src={src} alt="Attached screenshot" className="h-14 w-14 rounded-md object-cover border border-border" />
                            ))}
                          </div>
                        )}
                        {m.content}
                      </div>
                    ) : m.type === 'build_request' ? (
                      <BuildCard build={m.build} />
                    ) : (
                      <div className="max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] bg-card border border-border text-foreground">
                        <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start"><div className="bg-card border border-border rounded-[12px] px-3 py-2 text-[13px] text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...</div></div>
                )}
                {messages.length === 1 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cfg.suggestions.map((s) => (
                      <button key={s} onClick={() => send(s)} className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">{s}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-border bg-card">
                {pending.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {pending.map((p, k) => (
                      <div key={k} className="relative">
                        <img src={p.preview} alt={p.name} className="h-12 w-12 rounded-md object-cover border border-border" />
                        <button
                          onClick={() => setPending((ps) => ps.filter((_, j) => j !== k))}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-popover border border-border text-muted-foreground hover:text-foreground flex items-center justify-center"
                          aria-label="Remove attachment"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy || pending.length >= MAX_IMAGES}
                    className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
                    aria-label="Attach a screenshot"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </Button>
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                    placeholder={cfg.placeholder}
                    className="bg-background text-[13px]"
                    disabled={busy}
                  />
                  <Button size="icon" onClick={() => send()} disabled={busy || (!input.trim() && pending.length === 0)} className="shrink-0 h-9 w-9"><Send className="w-4 h-4" /></Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {pending.length > 0
                    ? `${pending.length} of ${MAX_IMAGES} screenshots attached.`
                    : 'Paste or attach a screenshot to ask about what you are looking at.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center hover:scale-105 transition-transform ml-auto"
        aria-label="Open assistants"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>
    </div>
  );
}