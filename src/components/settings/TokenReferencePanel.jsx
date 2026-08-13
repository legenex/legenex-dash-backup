import { useState, useMemo } from 'react';
import TransformsReference, { insertAtCursor } from '@/components/settings/TransformsReference';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const DEFAULT_HLR_TOKENS = ['phone_verified', 'hlr_status', 'hlr_score', 'country_code'];
const SYSTEM_TOKENS = ['lead_event'];

export default function TokenReferencePanel({ customFields = [], hlrTokens = DEFAULT_HLR_TOKENS }) {
  const [search, setSearch] = useState('');

  const fieldTokens = useMemo(() => customFields.map(f => f.field_name), [customFields]);

  const filterTokens = (tokens) => {
    if (!search.trim()) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(t => t.toLowerCase().includes(q));
  };

  const filteredFields = filterTokens(fieldTokens);
  const filteredHlr = filterTokens(hlrTokens);
  const filteredSystem = filterTokens(SYSTEM_TOKENS);

  const handleClick = (token) => {
    insertAtCursor('{{' + token + '}}');
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tokens..."
          className="pl-7 h-8 text-[12px] bg-background"
        />
      </div>
      <TransformsReference />
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">System Tokens</div>
        <div className="space-y-1">
          {filteredSystem.length === 0 && <div className="text-[11px] text-muted-foreground">No matching tokens</div>}
          {filteredSystem.map(t => (
            <div key={t} className="flex items-center gap-2">
              <code className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 shrink-0"
                onClick={() => handleClick(t)}>
                {'{{' + t + '}}'}
              </code>
              <span className="text-[10px] text-muted-foreground">{t === 'lead_event' ? 'Event name for current trigger' : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Lead Fields</div>
        <div className="space-y-1">
          {filteredFields.length === 0 && <div className="text-[11px] text-muted-foreground">No matching fields</div>}
          {filteredFields.map(t => (
            <code key={t} className="block text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
              onClick={() => handleClick(t)}>
              {'{{' + t + '}}'}
            </code>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">HLR Tokens</div>
        <div className="space-y-1">
          {filteredHlr.length === 0 && <div className="text-[11px] text-muted-foreground">No matching tokens</div>}
          {filteredHlr.map(t => (
            <code key={t} className="block text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
              onClick={() => handleClick(t)}>
              {'{{' + t + '}}'}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}