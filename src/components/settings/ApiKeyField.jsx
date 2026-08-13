import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

// One control for entering an API key, shared by every connection that needs
// one. Hidden by default with an explicit reveal, because a key sitting in
// plain text on screen is the thing that ends up in a screenshot.
//
// Not Ringba-specific and not environment-specific: any connection that
// authenticates with a key uses this.
export default function ApiKeyField({
  value,
  onChange,
  label = 'API Key',
  placeholder = 'API key here',
  hint,
}) {
  const [revealed, setRevealed] = useState(false);
  const has = String(value || '').trim() !== '';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {has && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1.5 text-[11px] text-muted-foreground"
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {revealed ? 'Hide' : 'Reveal'}
          </Button>
        )}
      </div>
      <Input
        type={revealed ? 'text' : 'password'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="bg-background font-mono text-[12px]"
      />
      <p className="text-[11px] text-muted-foreground">
        {hint || 'Sent as the Authorization header when this connection runs. Stored on the record and never shown in list views.'}
      </p>
    </div>
  );
}

// Masked hint for list views: enough to tell two keys apart, not enough to use.
export function maskKey(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return `••••${v.slice(-4)}`;
}
