import React from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Trash2, ListPlus, Pencil, X } from 'lucide-react';

/**
 * Bulk action toolbar shown when one or more leads are selected.
 *
 * Props:
 *  - selectedCount
 *  - onResubmit: () => void
 *  - onDelete: () => void         (confirmation handled by parent)
 *  - onQueue: () => void
 *  - onEdit: () => void           (only enabled when exactly 1 selected)
 *  - onClear: () => void
 *  - resubmitting: boolean
 *  - progress: { done, total } | null
 */
export default function BulkActionBar({
  selectedCount,
  onResubmit,
  onDelete,
  onQueue,
  onEdit,
  onClear,
  resubmitting = false,
  progress = null,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-card border border-border rounded-[10px] flex-wrap">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary/15 text-primary text-[12px] font-semibold">
          {selectedCount}
        </span>
        <span className="text-[13px] text-foreground font-medium">selected</span>
      </div>

      {progress && (
        <div className="text-[12px] text-muted-foreground font-mono">
          {progress.done}/{progress.total} resubmitted
        </div>
      )}

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          disabled={selectedCount !== 1 || resubmitting}
          className="gap-1.5 border-border bg-background text-primary"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onResubmit}
          disabled={resubmitting}
          className="gap-1.5 border-border bg-background text-primary"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${resubmitting ? 'animate-spin' : ''}`} />
          {resubmitting ? 'Re-submitting...' : 'Re-submit'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onQueue}
          disabled={resubmitting}
          className="gap-1.5 border-border bg-background"
        >
          <ListPlus className="w-3.5 h-3.5" />
          Queue
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={resubmitting}
          className="gap-1.5 border-border bg-background text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} className="gap-1 text-muted-foreground">
          <X className="w-3.5 h-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}