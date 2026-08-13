import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Columns, GripVertical, X, Plus } from 'lucide-react';

// Popover for managing table columns: reorder visible columns via drag,
// remove them, and add any system or custom-field column.
export default function ColumnManager({ config, availableColumns, onChange }) {
  const [open, setOpen] = useState(false);
  const visibleKeys = config.columns.map((c) => c.key);
  const availableToAdd = availableColumns.filter((c) => !visibleKeys.includes(c.key));

  const labelFor = (key) => availableColumns.find((c) => c.key === key)?.header || key;

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const columns = [...config.columns];
    const [moved] = columns.splice(from, 1);
    columns.splice(to, 0, moved);
    onChange({ ...config, columns });
  };

  const removeColumn = (key) => {
    onChange({ ...config, columns: config.columns.filter((c) => c.key !== key) });
  };

  const addColumn = (key) => {
    onChange({ ...config, columns: [...config.columns, { key, width: null }] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns className="w-4 h-4" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b border-border">
          <div className="text-[12px] font-semibold text-foreground">Manage Columns</div>
          <div className="text-[10px] text-muted-foreground">Drag to reorder · remove or add below</div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {config.columns.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">No columns selected</div>
          )}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="cols">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {config.columns.map((c, idx) => (
                    <Draggable key={c.key} draggableId={c.key} index={idx}>
                      {(p) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className="flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-accent/40"
                        >
                          <span {...p.dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground">
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-[12px] text-foreground flex-1 truncate">{labelFor(c.key)}</span>
                          <button
                            type="button"
                            onClick={() => removeColumn(c.key)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
        {availableToAdd.length > 0 && (
          <div className="p-3 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Add Column</div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {availableToAdd.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => addColumn(c.key)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="w-3 h-3" /> {c.header}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}