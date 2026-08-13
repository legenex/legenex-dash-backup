import React, { useState } from 'react';
import { distributionInsights } from '@/functions/distributionInsights';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// AI operational insights for the current period. On demand to avoid burning credits on every render.
export default function AiInsightsPanel({ summary, periodLabel }) {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await distributionInsights({ summary, periodLabel });
      const text = res?.data?.insights || '';
      if (text) setInsights(text);
      else toast.error(res?.data?.error || 'Could not generate insights');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not generate insights');
    }
    setLoading(false);
  };

  const bullets = insights.split('\n').map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, ''));

  return (
    <div className="bg-card border border-primary/20 rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-[18px] h-[18px] text-primary" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-foreground">AI Insights</div>
            <div className="text-[11px] text-muted-foreground">Operational trends for {periodLabel}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={run} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {insights ? 'Refresh' : 'Generate'}
        </Button>
      </div>

      {loading && !insights && (
        <div className="text-[13px] text-muted-foreground py-4">Analyzing this period's operational data…</div>
      )}
      {!loading && !insights && (
        <div className="text-[13px] text-muted-foreground py-4">Generate an AI summary of volume shifts, DQ/error trends and source anomalies for this period.</div>
      )}
      {bullets.length > 0 && (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-foreground">
              <span className="text-primary mt-0.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}