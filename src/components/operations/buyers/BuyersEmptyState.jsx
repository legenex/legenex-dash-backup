import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Plus } from 'lucide-react';

// Shown when there are no buyers at all. Explains where buyers come from and
// launches the Create Buyer modal.
export default function BuyersEmptyState({ onCreate }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-14 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
          <Users className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-[15px] font-semibold text-foreground">No buyers yet</h3>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md">
          Buyers are created in Operations and flow through to Lead Distribution, where their
          coverage and pricing drive which states are open.
        </p>
        <Button onClick={onCreate} className="gap-1.5 mt-5">
          <Plus className="w-4 h-4" /> Create Buyer
        </Button>
      </CardContent>
    </Card>
  );
}