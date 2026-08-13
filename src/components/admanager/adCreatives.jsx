import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Video, Download, Flame, UserCircle2, Layers, Tag as TagIcon, Sparkles } from 'lucide-react';
import { downloadCsv } from '@/lib/csv';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Panel, SectionHead, Btn, Tag, HeatCell, SpendCell, Thumb, BandChip, rise, TONE, EmptyState } from './adAtoms';
import { f0, f2, num, pct, roasText, cplTone, roasTone, rollupCreatives } from '@/lib/adManagerMetrics';

const dash = <span className="text-muted-foreground/40">-</span>;

/* ------------------------------------------------------------------ */
/*  Creative tagging                                                   */
/*  Meta exposes no hook, concept or creator. The operator tags them    */
/*  once per ad id and every rollup below becomes real.                 */
/* ------------------------------------------------------------------ */
export function TagCreativeDialog({ creative, open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ concept: '', hook: '', creator: '', utm_content: '', creative_type: 'video' });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (creative) {
      setForm({
        concept: creative.concept || '',
        hook: creative.hook || '',
        creator: creative.creator || '',
        utm_content: creative.utmContent || '',
        creative_type: creative.creativeType || 'video',
      });
    }
  }, [creative]);

  const save = async () => {
    if (!creative) return;
    setSaving(true);
    try {
      const existing = await base44.entities.AdCreativeMeta.filter({ ad_id: creative.adId });
      const payload = { ...form, ad_id: creative.adId, ad_name: creative.name, ad_account_id: creative.accountId, platform: 'meta' };
      if (existing.length) await base44.entities.AdCreativeMeta.update(existing[0].id, payload);
      else await base44.entities.AdCreativeMeta.create(payload);
      toast({ title: 'Creative tagged', description: `${creative.name} now feeds the hook, creator and concept rollups.` });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-[15px]">Tag creative</DialogTitle></DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-2">
          {creative?.name}. Set utm_content to the exact value this ad passes to the funnel so verified sold outcomes join back to it.
        </p>
        <div className="space-y-3 mt-2">
          {[
            ['concept', 'Concept', 'ER Waiting Room'],
            ['hook', 'Hook', 'Still waiting on your check?'],
            ['creator', 'Creator', 'Maya R. or Studio'],
            ['utm_content', 'utm_content passed by this ad', 'SUE5'],
          ].map(([k, label, ph]) => (
            <div key={k} className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</Label>
              <Input value={form[k]} placeholder={ph} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className="h-9 text-[12px]" />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Creative type</Label>
            <div className="flex gap-1.5">
              {['video', 'image', 'carousel', 'other'].map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, creative_type: t }))}
                  className={`px-3 h-8 rounded-lg text-[11.5px] border capitalize ${form.creative_type === t ? 'bg-primary/10 text-primary border-primary/35' : 'border-border text-muted-foreground'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving' : 'Save tag'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Creative leaderboard                                               */
/* ------------------------------------------------------------------ */
export function CreativeLeaderboard({ creatives, onTag }) {
  const tmpl = '40px 2.2fr 1fr 0.9fr 0.9fr 1fr 0.8fr 1fr 0.9fr 60px';
  const max = Math.max(1, ...creatives.map((c) => c.revenue));

  if (!creatives.length) {
    return (
      <EmptyState
        icon={Video}
        title="No ad level spend synced"
        body="Creative rows come from the ad level pass of syncMetaSpend. Run a sync, or widen the date range."
      />
    );
  }

  return (
    <Panel>
      <SectionHead
        icon={Video}
        title="Creative leaderboard"
        sub="Each creative is one permanent object, keyed on its Meta ad id and tracked across every campaign and account"
        right={<Btn icon={Download} onClick={() => downloadCsv('ad_manager_creatives', [
          { key: 'name', label: 'Creative' }, { key: 'concept', label: 'Concept' }, { key: 'creator', label: 'Creator' },
          { key: 'spend', label: 'Spend' }, { key: 'thumbstop', label: 'Thumbstop %' }, { key: 'holdRate', label: 'Hold %' },
          { key: 'realCpl', label: 'Real CPL' }, { key: 'sold', label: 'Sold' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' },
        ], creatives)}>Export</Btn>}
      />
      <div className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase items-center text-muted-foreground/70" style={{ gridTemplateColumns: tmpl }}>
        <span /><span>Creative</span>
        <span className="text-right">Thumbstop</span><span className="text-right">Hold</span><span className="text-right">CTR</span>
        <span className="text-right" style={{ color: TONE.good }}>Real CPL</span>
        <span className="text-right" style={{ color: TONE.good }}>Sold</span>
        <span className="text-right" style={{ color: TONE.good }}>Revenue</span>
        <span className="text-right" style={{ color: TONE.good }}>ROAS</span>
        <span className="text-right">Tag</span>
      </div>
      {creatives.map((c, i) => (
        <motion.div key={c.adId} variants={rise} initial="hidden" animate="show" custom={Math.min(i, 8)}
          className="grid gap-2 px-4 py-3 border-b border-border/60 items-center hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: tmpl }}>
          <Thumb kind={c.creativeType} w={34} h={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold truncate text-foreground">{c.name}</span>
              <BandChip band={c.band} />
            </div>
            <div className="text-[10px] mt-0.5 truncate text-muted-foreground/70">
              {c.tagged
                ? [c.hook && `"${c.hook}"`, c.concept, c.creator].filter(Boolean).join(', ')
                : 'untagged, hook and concept unknown'}
              {c.campaignName ? `, ${c.campaignName}` : ''}
            </div>
          </div>
          <span className="text-right text-[11.5px] font-mono tabular-nums" style={{ color: c.thumbstop == null ? undefined : c.thumbstop >= 30 ? TONE.good : c.thumbstop >= 20 ? TONE.warn : TONE.bad }}>
            {c.thumbstop == null ? dash : pct(c.thumbstop)}
          </span>
          <span className="text-right text-[11.5px] font-mono tabular-nums text-muted-foreground">{c.holdRate == null ? dash : pct(c.holdRate)}</span>
          <span className="text-right text-[11.5px] font-mono tabular-nums text-muted-foreground">{pct(c.ctr)}</span>
          <span className="text-right">{c.realCpl == null ? dash : <HeatCell value={f2(c.realCpl)} tone={cplTone(c.realCpl)} />}</span>
          <span className="text-right text-[11.5px] font-mono tabular-nums font-semibold" style={{ color: TONE.good }}>{c.matched ? num(c.sold) : dash}</span>
          <span className="text-right">{c.matched ? <SpendCell value={c.revenue} ratio={c.revenue / max} format={f0} /> : dash}</span>
          <span className="text-right">{c.roas == null ? dash : <HeatCell value={roasText(c.roas)} tone={roasTone(c.roas)} />}</span>
          <div className="flex justify-end">
            <button onClick={() => onTag(c)} title="Tag hook, concept, creator and utm_content"
              className={`p-1.5 rounded-md border ${c.tagged ? 'border-border text-muted-foreground/70' : 'border-primary/35 text-primary bg-primary/10'}`}>
              <TagIcon className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      ))}
      <div className="px-4 py-2.5 text-[10.5px] text-muted-foreground/70">
        Thumbstop is 3 second views divided by impressions. Hold is thruplays divided by impressions. Image ads report neither, so those cells stay empty.
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook, creator and concept rollups                                  */
/* ------------------------------------------------------------------ */
function RollupCard({ title, icon: Icon, result, showShare }) {
  const { rows, untagged } = result;
  return (
    <Panel>
      <SectionHead icon={Icon} title={title} right={<Tag>ranked by revenue</Tag>} />
      <div className="px-4 pb-4 space-y-1.5">
        {rows.length === 0 && (
          <div className="py-8 text-center text-[11.5px] text-muted-foreground">
            Nothing tagged yet. Tag creatives in the leaderboard above and this rollup fills in.
          </div>
        )}
        {rows.map((r, i) => (
          <motion.div key={r.key} variants={rise} initial="hidden" animate="show" custom={Math.min(i, 8)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/40">
            <span className={`w-5 h-5 rounded grid place-items-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/70'}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold truncate text-foreground">{r.key}</div>
              {showShare ? (
                <div className="h-1 rounded-full mt-1.5 w-full bg-border">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${r.share}%` }} />
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground/70">{r.ads} ads, {num(r.sold)} sold</div>
              )}
            </div>
            <div className="text-right shrink-0">{r.realCpl == null ? dash : <HeatCell value={f2(r.realCpl)} tone={cplTone(r.realCpl)} />}</div>
            <span className="text-[11px] font-mono w-12 text-right" style={{ color: roasTone(r.roas) }}>{roasText(r.roas)}</span>
          </motion.div>
        ))}
        {untagged > 0 && (
          <div className="text-[10px] text-muted-foreground/60 pt-1">
            {untagged} untagged {untagged === 1 ? 'creative is' : 'creatives are'} excluded from this rollup.
          </div>
        )}
      </div>
    </Panel>
  );
}

export function CreativeRollups({ creatives }) {
  const hooks = useMemo(() => rollupCreatives(creatives, 'hook'), [creatives]);
  const creators = useMemo(() => rollupCreatives(creatives, 'creator'), [creatives]);
  const concepts = useMemo(() => rollupCreatives(creatives, 'concept'), [creatives]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <RollupCard title="Hook analysis" icon={Flame} result={hooks} />
      <RollupCard title="Creator analysis" icon={UserCircle2} result={creators} />
      <RollupCard title="Concept analysis" icon={Layers} result={concepts} showShare />
    </div>
  );
}

export { Sparkles };
