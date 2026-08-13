import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Public status page rendered when the app is served on the API host
// (api.legenex.com). No auth, this domain exists only to serve backend
// functions, so we just surface a simple health readout.
export default function ApiStatus() {
  const [state, setState] = useState({ loading: true, ok: false, error: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('health', {});
        const ok = res?.data?.status === 'ok';
        if (alive) setState({ loading: false, ok, error: null });
      } catch (e) {
        if (alive) setState({ loading: false, ok: false, error: e?.message || 'unreachable' });
      }
    })();
    return () => { alive = false; };
  }, []);

  const dotColor = state.loading ? '#FACC14' : state.ok ? '#3DD68C' : '#E5484D';
  const label = state.loading ? 'Checking…' : state.ok ? 'Operational' : 'Unavailable';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Legenex API
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-foreground font-heading">
          api.legenex.com
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Backend API endpoint. This host serves functions only.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2.5 rounded-lg border border-border bg-muted/40 py-3">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>

        {state.error && (
          <p className="mt-3 text-xs font-mono text-muted-foreground break-all">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}