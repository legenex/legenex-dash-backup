import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw, AlertCircle, Wand2 } from 'lucide-react';
import { format } from 'date-fns';

const CERT_REGEX = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;

export default function QueueRecoveryRow({
  lead,
  isSelected,
  onToggleSelect,
  certValue,
  onCertChange,
  onRerun,
  rerunning,
  onAutoRecover,
  autoRecovering,
}) {
  const trimmed = (certValue || '').trim();
  const isValid = trimmed !== '' && CERT_REGEX.test(trimmed);
  const showError = trimmed !== '' && !isValid;

  return (
    <tr className={`hover:bg-accent/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={v => onToggleSelect(lead.id, v)}
          aria-label={`Select lead ${lead.id}`}
        />
      </td>
      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        {lead.created_date ? format(new Date(lead.created_date), 'MMM dd HH:mm') : '-'}
      </td>
      <td className="px-4 py-3 text-secondary-foreground">{lead.supplier_name || '-'}</td>
      <td className="px-4 py-3 text-foreground">
        {lead.first_name || ''} {lead.last_name || ''}
      </td>
      <td className="px-4 py-3 font-mono text-[12px]">{lead.mobile || '-'}</td>
      <td className="px-4 py-3 text-[12px]">{lead.email || '-'}</td>
      <td className="px-4 py-3 text-[12px] text-purple-400 max-w-[200px] truncate" title={lead.queue_reason || ''}>
        {lead.queue_reason || '-'}
      </td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="w-[280px]">
          <Input
            value={certValue || ''}
            onChange={e => onCertChange(lead.id, e.target.value)}
            placeholder="https://cert.trustedform.com/…"
            className={`bg-background font-mono text-[11px] ${showError ? 'border-destructive' : isValid ? 'border-green-500' : 'border-border'}`}
            disabled={rerunning}
          />
          {showError && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-destructive">
              <AlertCircle className="w-3 h-3" />
              Must match cert.trustedform.com/{'<40-char-hex>'}
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAutoRecover(lead)}
            disabled={autoRecovering || rerunning}
            className="gap-1.5 whitespace-nowrap"
          >
            <Wand2 className={`w-3.5 h-3.5 ${autoRecovering ? 'animate-spin' : ''}`} />
            {autoRecovering ? 'Recovering…' : 'Auto-Recover'}
          </Button>
          <Button
            size="sm"
            onClick={() => onRerun(lead)}
            disabled={!isValid || rerunning || autoRecovering}
            className="gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${rerunning ? 'animate-spin' : ''}`} />
            {rerunning ? 'Running…' : 'Assign & Rerun'}
          </Button>
        </div>
      </td>
    </tr>
  );
}