import React from 'react';
import { Brain, Sparkle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import AnimatedPanel from '@/components/overview/AnimatedPanel';

const CHIPS = [
  { label: 'Revenue', tone: 'neutral' },
  { label: 'Cash', tone: 'neutral' },
  { label: 'Buyer Risk', tone: 'red' },
  { label: 'Data Quality', tone: 'red' },
];

// AI Analyst briefing band. Parent owns the data + refresh; this is presentational.
// Optional confidence (0-100), riskLevel word, riskNote, topRecommendation, feedCount.
export default function AiAnalystBand({
  text, loading, error, onRefresh,
  confidence = 0, riskLevel = 'Watch', riskNote = 'stale ingestion',
  topRecommendation = 'Verify booked revenue against cash before scaling any campaign.',
  feedCount = 10, onAskAi, onExplainVariance,
}) {
  return (
    <div className="relative p-5 overflow-hidden">
      {/* ambient: faint red shimmer sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 w-1/3 pointer-events-none bg-gradient-to-r from-transparent via-primary/[0.07] to-transparent"
        animate={{ x: ['-120%', '360%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
      {/* ambient: scanning dot */}
      <motion.div
        aria-hidden
        className="absolute top-0 h-0.5 w-16 rounded-full pointer-events-none bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        animate={{ left: ['-10%', '100%'] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* corner glow */}
      <motion.div
        aria-hidden
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="relative flex flex-col lg:flex-row gap-5">
        {/* Left: brain + narrative */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="relative shrink-0">
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-xl bg-primary/25 blur-md"
              animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.9, 1.15, 0.9] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Brain className="w-[22px] h-[22px] text-primary" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-[12px] font-semibold text-foreground uppercase tracking-wider">AI Analyst</div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-[#3DD68C]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                Watching {feedCount} feeds
              </span>
              <button
                onClick={onRefresh}
                disabled={loading}
                className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {/* tag chips */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {CHIPS.map(c => (
                <span
                  key={c.label}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${c.tone === 'red' ? 'status-error-bg status-error' : 'tag-neutral'}`}
                >
                  {c.label}
                </span>
              ))}
            </div>

            {/* narrative */}
            {loading ? (
              <div className="mt-3 space-y-2">
                {[92, 100, 74].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-muted overflow-hidden relative" style={{ width: `${w}%` }}>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="mt-2 text-[13px] status-error">{error}</div>
            ) : (
              <motion.p
                key={text}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="mt-2.5 text-[13px] leading-relaxed text-foreground/90"
              >
                {text}
              </motion.p>
            )}

            {/* top recommendation sub-banner */}
            {!loading && !error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/[0.06] border border-primary/15 px-3 py-2">
                <Sparkle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div className="text-[12px] text-foreground/90">
                  <span className="font-semibold text-foreground">Top recommendation:</span> {topRecommendation}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: confidence + risk + actions */}
        <div className="lg:w-72 shrink-0 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Confidence */}
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Confidence</div>
              <div className="text-[22px] font-bold text-foreground mt-0.5 font-display tabular-nums">{Math.round(confidence)}%</div>
              <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </div>
            </div>

            {/* Risk level */}
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Level</div>
              <div className="text-[16px] font-bold text-foreground mt-1 font-display">{riskLevel}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{riskNote}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onAskAi}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors"
            >
              <Sparkle className="w-3.5 h-3.5" /> Ask AI
            </button>
            <button
              onClick={onExplainVariance}
              className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border transition-colors"
            >
              Explain variance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}