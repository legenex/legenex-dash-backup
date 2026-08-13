import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

// Shown when StateStatus has no rows for the selected vertical. Coverage is
// derived data written only by the engine, so this page cannot compute it.
export default function StatesEmptyState({ vertical }) {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col items-center text-center py-14 px-6">
        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center mb-4">
          <MapPin className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-[15px] font-semibold text-foreground">Coverage not computed yet</h3>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md">
          There are no computed state coverage rows for {vertical || 'this vertical'} yet. Coverage is derived from
          active buyers and their state pricing. Add or activate buyers with coverage in this vertical, then the engine
          will populate these states.
        </p>
        <Button asChild className="mt-5">
          <Link to="/operations/buyers">Go to Buyer Management</Link>
        </Button>
      </CardContent>
    </Card>
  );
}