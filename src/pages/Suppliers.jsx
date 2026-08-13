import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';
import SettingsBrands from '@/components/settings/SettingsBrands';

export default function Suppliers() {
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Manage lead suppliers, brands, API keys, and endpoint settings" />
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers" className="mt-4"><SettingsSuppliers /></TabsContent>
        <TabsContent value="brands" className="mt-4"><SettingsBrands /></TabsContent>
      </Tabs>
    </div>
  );
}