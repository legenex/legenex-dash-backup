import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wand2, Crosshair, Workflow, Rocket, Lock, Megaphone, Layers, Play, BadgeCheck,
  ChevronDown, Sparkles, Link2, Bot, Image as ImageIcon,
} from 'lucide-react';
import SectionHeader from '@/components/shared/SectionHeader';
import useAdManagerData from '@/hooks/useAdManagerData';
import { Panel, SectionHead, Btn, Tag, BandChip } from '@/components/admanager/adAtoms';
import { buildCreatives, f2, num, roasText } from '@/lib/adManagerMetrics';

const Field = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-semibold tracking-[0.08em] uppercase mb-1.5 text-muted-foreground/70">{label}</div>
    {children}
  </div>
);

const Selectish = ({ value, options, onChange, disabled }) => (
  <div className="relative">
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full h-9 px-3 pr-8 rounded-lg border border-border bg-background/60 text-[12px] text-foreground appearance-none outline-none disabled:opacity-60"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/70" />
  </div>
);

const TextInput = ({ value, onChange, prefix }) => (
  <div className="flex items-center h-9 px-3 rounded-lg border border-border bg-background/60">
    {prefix && <span className="text-[12px] mr-1 text-muted-foreground/70">{prefix}</span>}
    <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent outline-none text-[12px] text-foreground" />
  </div>
);

/* Campaign setup, drafted against the real winning creative in the window. */
function MetaAdBuilder({ accounts, brief }) {
  const [obj, setObj] = useState('Lead generation');
  const [dest, setDest] = useState('Instant Form');
  const [target, setTarget] = useState(accounts[0]?.name || 'No mapped account');
  const [aud, setAud] = useState('Broad, Advantage+');
  const [budget, setBudget] = useState('850');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
      <Panel>
        <SectionHead icon={Crosshair} title="Campaign setup" sub="Will build on the Meta Marketing API" right={<Tag tone="blue">Meta</Tag>} />
        <div className="px-5 pb-5 space-y-4">
          {brief ? (
            <div className="rounded-lg border p-3.5" style={{ borderColor: 'rgba(61,214,140,0.3)', background: 'rgba(61,214,140,0.12)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BadgeCheck className="w-3.5 h-3.5 shrink-0" style={{ color: '#3DD68C' }} />
                  <span className="text-[12.5px] font-semibold truncate text-foreground">Winning brief, {brief.concept || brief.name}</span>
                </div>
                <BandChip band={brief.band} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2.5">
                {[['Real ROAS', roasText(brief.roas)], ['Real CPL', f2(brief.realCpl)], ['Sold', num(brief.sold)]].map(([l, v]) => (
                  <div key={l}>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{l}</div>
                    <div className="text-[14px] font-bold font-mono" style={{ color: '#3DD68C' }}>{v}</div>
                  </div>
                ))}
              </div>
              {brief.hook && <div className="text-[10.5px] mt-2 text-muted-foreground">Hook: "{brief.hook}", Creator: {brief.creator || 'untagged'}</div>}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/50 p-3.5 text-[11.5px] text-muted-foreground">
              No verified winning creative in the current window. Tag creatives in the Creative Analyzer so the builder can brief from proven sold economics rather than from platform metrics.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Objective"><Selectish value={obj} onChange={setObj} options={['Lead generation', 'Conversions', 'Traffic', 'Awareness']} /></Field>
            <Field label="Destination"><Selectish value={dest} onChange={setDest} options={['Instant Form', 'Website', 'Calls', 'Messenger']} /></Field>
          </div>
          <Field label="Target ad account">
            <Selectish value={target} onChange={setTarget} options={accounts.length ? accounts.map((a) => a.name) : ['No mapped account']} />
          </Field>
          <Field label="Audience">
            <Selectish value={aud} onChange={setAud} options={['Broad, Advantage+', 'Injury Intent, LAL 3%', 'State Targeted', 'Retargeting']} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily budget"><TextInput value={budget} onChange={setBudget} prefix="$" /></Field>
            <Field label="Schedule"><Selectish value="Start today, no end" options={['Start today, no end', 'Start tomorrow', 'Custom range']} /></Field>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <SectionHead icon={Workflow} title="Campaign structure" sub="What the builder will create" />
          <div className="px-5 pb-4">
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-background/50">
                <Megaphone className="w-3.5 h-3.5 text-primary" />
                <span className="text-[12px] font-semibold text-foreground truncate">MVA, {brief?.concept || 'new concept'}, {new Date().getFullYear()}</span>
                <Tag tone="blue">Campaign</Tag>
              </div>
              <div className="pl-6 border-t border-border/60">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11.5px] text-muted-foreground">{aud}</span>
                  <span className="ml-auto text-[10.5px] font-mono text-muted-foreground/70">${budget}/day</span>
                </div>
                {(brief ? [`${brief.name}, 9:16`, `${brief.name}, hook variant`] : ['Creative slot 1', 'Creative slot 2']).map((ad) => (
                  <div key={ad} className="flex items-center gap-2 px-3 py-2 border-t border-border/60">
                    <Play className="w-2.5 h-2.5 text-muted-foreground/60" fill="currentColor" />
                    <span className="text-[11px] text-muted-foreground/70 truncate">{ad}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Rocket className="w-3.5 h-3.5 text-primary" /> Launch to <span className="font-semibold text-foreground">{target}</span>
            </div>
            <Btn icon={Rocket} primary disabled title="Publishing is not enabled yet">Launch</Btn>
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[10.5px] text-muted-foreground/70">
            <Lock className="w-3 h-3" /> Draft only. Nothing is written to Meta from this screen.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CreativesGenerator({ concepts }) {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('9:16');
  const [style, setStyle] = useState('UGC selfie');
  const slots = ['Hook v2', 'New creator', '15s cut', 'Caption A', 'B roll', 'Split screen'];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHead icon={Wand2} title="Creatives Generator" sub="Generate on-brief variations from a proven concept" right={<Tag tone="amber">Not connected</Tag>} />
        <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <Field label="Creative brief">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the creative you want generated once a generation provider is connected."
              className="w-full p-3 rounded-lg border border-border bg-background/60 text-[12px] leading-relaxed outline-none resize-none text-foreground"
            />
          </Field>
          <div className="space-y-3">
            <Field label="Base concept">
              <Selectish value={concepts[0] || 'No tagged concepts'} options={concepts.length ? concepts : ['No tagged concepts']} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Format"><Selectish value={format} onChange={setFormat} options={['9:16', '1:1', '16:9', '4:5']} /></Field>
              <Field label="Style"><Selectish value={style} onChange={setStyle} options={['UGC selfie', 'Studio', 'Reenactment', 'Motion graphic']} /></Field>
            </div>
            <Btn icon={Sparkles} primary disabled title="No generation provider connected">Generate variations</Btn>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHead icon={ImageIcon} title="Generated variations" sub="Connect a generation provider to populate this grid" />
        <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {slots.map((v) => (
            <div key={v} className="rounded-lg border border-border/60 overflow-hidden opacity-40">
              <div className="aspect-[9/13] grid place-items-center bg-gradient-to-br from-accent to-background">
                <Wand2 className="w-4 h-4 text-muted-foreground/70" />
              </div>
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate">{v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Wand2, t: 'Generation provider', d: 'Video and image variations briefed from your proven concepts. Not connected yet.' },
          { icon: Link2, t: 'Meta Marketing API', d: 'Approved variations will flow into the Ad Builder campaign structure.' },
          { icon: Bot, t: 'Brief agent', d: 'Assembles each brief from verified sold economics, not from vanity metrics.' },
        ].map((x) => (
          <Panel key={x.t} className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-muted"><x.icon className="w-4 h-4 text-muted-foreground" /></div>
            <div>
              <div className="text-[12.5px] font-semibold text-foreground">{x.t}</div>
              <div className="text-[11px] mt-0.5 leading-relaxed text-muted-foreground/70">{x.d}</div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'builder', label: 'Ad Builder', icon: Crosshair },
  { id: 'generator', label: 'Creatives Generator', icon: Wand2 },
];

// Ad Builder: the launch surface. Publishing is deliberately inert until the
// Meta Marketing API write path is built, so nothing here can touch a live
// ad account by accident.
export default function AdBuilder() {
  const [tab, setTab] = useState('builder');
  const d = useAdManagerData();
  const { accounts, spendRows, creativeMeta, platform, portfolio } = d;

  const creatives = useMemo(
    () => buildCreatives({ spendRows, leads: portfolio.leads || [], creativeMeta, platform }),
    [spendRows, portfolio, creativeMeta, platform]
  );
  const brief = creatives.filter((c) => c.matched && c.roas != null).sort((a, b) => b.roas - a.roas)[0] || null;
  const concepts = Array.from(new Set(creatives.map((c) => c.concept).filter(Boolean)));

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionHeader
        title="Ad Builder"
        subtitle="Launch proven concepts to Meta and generate creatives from a verified brief."
      />

      <Panel className="overflow-hidden">
        <div className="relative p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center bg-primary/10 border border-primary/30">
              <Wand2 className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-foreground">Ad Builder</span>
                <Tag tone="amber">Coming Soon</Tag>
              </div>
              <div className="text-[11.5px] mt-0.5 text-muted-foreground">
                Build Meta campaigns from a brief proven by sold revenue, generate creatives, launch without leaving Legenex.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-background/50">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-[12px] font-medium ${on ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {tab === 'builder' ? <MetaAdBuilder accounts={accounts} brief={brief} /> : <CreativesGenerator concepts={concepts} />}
      </motion.div>
    </div>
  );
}
