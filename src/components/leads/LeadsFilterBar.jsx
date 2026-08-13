import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Panel } from '@/components/settings/settingsUi';
import MobileFilterSheet from '@/components/shared/MobileFilterSheet';
import LeadsPeriodFilter from '@/components/shared/LeadsPeriodFilter';
import { Search, Filter, Plus, X, Save, Trash2 } from 'lucide-react';

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
];

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty'];

export default function LeadsFilterBar({
  search, setSearch,
  period, setPeriod,
  customPeriod, setCustomPeriod,
  customFilters, setCustomFilters,
  savedSets, onSaveSet, onDeleteSet, onApplySet,
  filterFields,
  resultCount,
  statusFilter, setStatusFilter, statusOptions,
  supplierFilter, setSupplierFilter, supplierOptions,
  buyerFilter, setBuyerFilter, buyerOptions = [],
  sourceFilter, setSourceFilter, sourceOptions,
  verticalFilter, setVerticalFilter, verticalOptions = [],
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [setName, setSetName] = useState('');
  const [activeSetId, setActiveSetId] = useState('');

  const addFilter = () => {
    setCustomFilters([...customFilters, { field: '', operator: 'equals', value: '' }]);
  };

  const updateFilter = (i, patch) => {
    setCustomFilters(customFilters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };

  const removeFilter = (i) => {
    setCustomFilters(customFilters.filter((_, idx) => idx !== i));
  };

  const clearAll = () => {
    setSearch('');
    setPeriod('this_month');
    setCustomPeriod({ from: '', to: '' });
    setCustomFilters([]);
    setActiveSetId('');
    if (setStatusFilter) setStatusFilter([]);
    if (setSupplierFilter) setSupplierFilter([]);
    if (setBuyerFilter) setBuyerFilter([]);
    if (setSourceFilter) setSourceFilter([]);
  };

  const handleApplySet = (id) => {
    const set = savedSets.find(s => s.id === id);
    if (set) {
      onApplySet(set);
      setActiveSetId(id);
    } else {
      setActiveSetId('');
    }
  };

  const handleSave = () => {
    if (setName.trim()) {
      onSaveSet(setName.trim());
      setSetName('');
      setShowSaveDialog(false);
    }
  };

  const handleDeleteSet = (id) => {
    onDeleteSet(id);
    if (activeSetId === id) setActiveSetId('');
  };

  const statusCount = Array.isArray(statusFilter) ? statusFilter.length : 0;
  const supplierCount = Array.isArray(supplierFilter) ? supplierFilter.length : 0;
  const buyerCount = Array.isArray(buyerFilter) ? buyerFilter.length : 0;
  const sourceCount = Array.isArray(sourceFilter) ? sourceFilter.length : 0;
  const hasActiveFilters = search || period !== 'this_month' || customFilters.length > 0 || statusCount || supplierCount || buyerCount || sourceCount;

  // Count active filters for the mobile Filters badge (search is separate).
  const activeCount = (period !== 'this_month' ? 1 : 0) + customFilters.length +
    statusCount + supplierCount + buyerCount + sourceCount;

  // Status / Suppliers / Sources / Time / Filters / Save controls. Rendered
  // inline on desktop and inside the mobile sheet. Identical markup either way.
  const controls = (
    <>
      <MultiSelect
        value={Array.isArray(statusFilter) ? statusFilter : []}
        onValueChange={setStatusFilter}
        className="w-full lg:w-[160px] bg-card border-border"
        options={statusOptions}
        placeholder="All Status"
      />
      <MultiSelect
        value={Array.isArray(supplierFilter) ? supplierFilter : []}
        onValueChange={setSupplierFilter}
        className="w-full lg:w-[180px] bg-card border-border"
        options={supplierOptions}
        placeholder="All Suppliers"
      />
      <MultiSelect
        value={Array.isArray(buyerFilter) ? buyerFilter : []}
        onValueChange={setBuyerFilter}
        className="w-full lg:w-[170px] bg-card border-border"
        options={buyerOptions}
        placeholder="All Buyers"
      />
      <MultiSelect
        value={Array.isArray(verticalFilter) ? verticalFilter : []}
        onValueChange={setVerticalFilter}
        className="w-full lg:w-[160px] bg-card border-border"
        options={verticalOptions}
        placeholder="All Verticals"
      />

      <MultiSelect
        value={Array.isArray(sourceFilter) ? sourceFilter : []}
        onValueChange={setSourceFilter}
        className="w-full lg:w-[170px] bg-card border-border"
        options={sourceOptions}
        placeholder="All Sources"
      />

      <LeadsPeriodFilter
        period={period}
        custom={customPeriod}
        onPeriodChange={setPeriod}
        onCustomChange={setCustomPeriod}
      />

      {savedSets.length > 0 && (
        <div className="flex items-center gap-1">
          <SearchableSelect
            value={activeSetId}
            onValueChange={handleApplySet}
            className="w-full lg:w-[160px] bg-card border-border"
            options={[{ value: '', label: 'Saved Filters' }, ...savedSets.map(s => ({ value: s.id, label: s.name }))]}
          />
          {activeSetId && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDeleteSet(activeSetId)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}

      <Button
        variant={showFilters || customFilters.length > 0 ? 'default' : 'outline'}
        size="sm"
        onClick={() => setShowFilters(!showFilters)}
        className="gap-1.5 w-full lg:w-auto"
      >
        <Filter className="w-3.5 h-3.5" /> Filters
        {customFilters.length > 0 && <Badge variant="secondary" className="ml-1">{customFilters.length}</Badge>}
      </Button>

      <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)} className="gap-1.5 w-full lg:w-auto">
        <Save className="w-3.5 h-3.5" /> Save
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-muted-foreground hidden lg:flex">
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
      )}

      {showFilters && (
        <div className="bg-card border border-border rounded-[10px] p-4 space-y-2 w-full lg:hidden">
          {customFilters.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-2">No custom filters. Click "Add Filter" to create one.</div>
          )}
          {customFilters.map((filter, i) => (
            <div key={i} className="flex items-center gap-2">
              <SearchableSelect
                value={filter.field}
                onValueChange={v => updateFilter(i, { field: v })}
                className="flex-1 bg-background"
                options={filterFields}
                placeholder="Field"
              />
              <SearchableSelect
                value={filter.operator}
                onValueChange={v => updateFilter(i, { operator: v })}
                className="w-[120px] bg-background"
                options={OPERATORS}
              />
              {!NO_VALUE_OPERATORS.includes(filter.operator) && (
                <Input
                  value={filter.value}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 bg-background"
                />
              )}
              <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeFilter(i)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addFilter} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Filter
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div className="mb-4 space-y-3">
      <Panel className="p-3 flex items-center gap-3 flex-wrap" i={0}>
        <MobileFilterSheet
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, mobile, email, supplier..."
          activeCount={activeCount}
          onClearAll={clearAll}
        >
          <div className="relative flex-1 max-w-xs hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, mobile, email, supplier..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          {controls}
        </MobileFilterSheet>

        <div className="text-[12px] text-muted-foreground ml-auto hidden lg:block">{resultCount} leads</div>
      </Panel>

      {/* Desktop custom-filters block. On mobile these controls live in the sheet above. */}
      {showFilters && (
        <div className="hidden lg:block bg-card border border-border rounded-[10px] p-4 space-y-2">
          {customFilters.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-2">No custom filters. Click "Add Filter" to create one.</div>
          )}
          {customFilters.map((filter, i) => (
            <div key={i} className="flex items-center gap-2">
              <SearchableSelect
                value={filter.field}
                onValueChange={v => updateFilter(i, { field: v })}
                className="w-[160px] bg-background"
                options={filterFields}
                placeholder="Field"
              />
              <SearchableSelect
                value={filter.operator}
                onValueChange={v => updateFilter(i, { operator: v })}
                className="w-[130px] bg-background"
                options={OPERATORS}
              />
              {!NO_VALUE_OPERATORS.includes(filter.operator) && (
                <Input
                  value={filter.value}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 bg-background"
                />
              )}
              <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeFilter(i)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addFilter} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Filter
          </Button>
        </div>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-[400px] bg-popover border-border">
          <DialogHeader>
            <DialogTitle>Save Filter Set</DialogTitle>
          </DialogHeader>
          <Input
            value={setName}
            onChange={e => setSetName(e.target.value)}
            placeholder="Enter a name for this filter set..."
            className="bg-background"
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!setName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}