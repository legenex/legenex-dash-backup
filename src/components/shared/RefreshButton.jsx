import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function RefreshButton({ onClick }) {
  const [spinning, setSpinning] = useState(false);

  const handle = async () => {
    setSpinning(true);
    try {
      await onClick?.();
    } finally {
      setTimeout(() => setSpinning(false), 600);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handle} className="gap-1.5">
      <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} /> Refresh
    </Button>
  );
}