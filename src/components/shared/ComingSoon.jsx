import React from 'react';
import { Rocket } from 'lucide-react';

export default function ComingSoon({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Rocket className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-[20px] font-bold text-foreground">{title}</h2>
      <p className="text-[14px] text-muted-foreground mt-2 max-w-md">
        {description || 'This section is coming soon. Check back later.'}
      </p>
      <span className="mt-6 px-3 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-semibold">
        Coming Soon
      </span>
    </div>
  );
}