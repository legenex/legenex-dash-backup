import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import SectionHeader from '@/components/shared/SectionHeader';
import CampaignCreateModal from '@/components/campaigns/CampaignCreateModal';
import CampaignsList from '@/components/campaigns/CampaignsList';
import CampaignDetailPage from '@/components/campaigns/CampaignDetailPage';

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 500) });
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || null, [campaigns, selectedId]);

  // Full-page detail swap: when a campaign is selected, render its detail in
  // place of the list.
  if (selected) {
    return <CampaignDetailPage key={selected.id} campaign={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <SectionHeader title="Campaigns" subtitle="Each campaign is a vertical. Routing, buyers, suppliers, and brands." />
      <div className="mt-4">
        <CampaignsList onCreate={() => setCreateOpen(true)} onOpen={(c) => setSelectedId(c.id)} />
      </div>
      <CampaignCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}