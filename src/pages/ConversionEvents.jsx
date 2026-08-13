import React from 'react';
import SectionHeader from '@/components/shared/SectionHeader';
import SettingsApiConnectors from '@/components/settings/SettingsApiConnectors';

export default function ConversionEvents() {
  return (
    <div>
      <SectionHeader title="Conversion Events" subtitle="Conversion API connectors - Facebook, TikTok, Google, SnapChat, Taboola & other platforms" />
      <SettingsApiConnectors />
    </div>
  );
}