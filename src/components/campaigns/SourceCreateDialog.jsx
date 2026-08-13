import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import SourceEditor from '@/components/operations/suppliers/SourceEditor';

// Create or edit a supplier source from inside a campaign, without leaving the
// page.
//
// Suppliers and their sources are OWNED BY OPERATIONS. This dialog wraps the
// same SourceEditor that Operations uses, so there is one editor and one set of
// validation rules, not a second copy that can drift. It replaces the old
// behaviour of navigating away to /suppliers/:id?tab=sources.
export default function SourceCreateDialog({ open, onOpenChange, supplier, source, existingCodes = [] }) {
  const qc = useQueryClient();

  async function afterSave() {
    await qc.invalidateQueries({ queryKey: ['op-supplier-sources'] });
    await qc.invalidateQueries({ queryKey: ['suppliers'] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[680px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {source?.id ? 'Edit source' : 'Create source'}{supplier?.name ? ` for ${supplier.name}` : ''}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Sources belong to the supplier and are managed in Operations. This edits the same record.
          </DialogDescription>
        </DialogHeader>

        {supplier && (
          <SourceEditor
            supplier={supplier}
            source={source || null}
            existingCodes={existingCodes}
            onBack={() => onOpenChange(false)}
            onSaved={afterSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
