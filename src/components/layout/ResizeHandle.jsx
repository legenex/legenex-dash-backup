import React from 'react';
import { GripVertical } from 'lucide-react';

// A vertical resize affordance pinned to the right edge of a column.
// - A thin line runs the full height and brightens on hover.
// - A grip icon sits near the bottom of the column (aligned with the sidebar's
//   version label) so every column's handle lines up; on hover it grows.
export default function ResizeHandle({ onMouseDown, title = 'Drag to resize' }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title={title}
      className="absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize group z-20 flex items-end justify-center pb-4"
    >
      {/* Full-height guide line, subtle until hover */}
      <div className="absolute inset-y-0 right-1 w-[2px] rounded-full bg-transparent group-hover:bg-primary/60 transition-colors duration-150" />
      {/* Fixed grip icon near the bottom, opaque red, grows on hover */}
      <div className="relative flex items-center justify-center h-7 w-4 rounded-md bg-primary text-primary-foreground shadow-sm transition-all duration-150 group-hover:h-9 group-hover:w-5">
        <GripVertical className="w-3 h-3" />
      </div>
    </div>
  );
}