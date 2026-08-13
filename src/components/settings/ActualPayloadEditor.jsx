import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Wand2, Code2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { HighlightedPayloadEditor } from '@/components/settings/HighlightedPayloadEditor';

/**
 * Build the default Actual Payload template that reproduces current pass-through output:
 *  - one entry per custom field currently forwarded (include_in_leadbyte === true)
 *  - LeadByte key = leadbyte_field_name (or field_name), value = {{field_name}}
 *  - phone_verified pulled from HLR result as {{phone_verified}}
 *  - calculated field tokens included
 * Returns a pretty-printed JSON string.
 */
export function buildDefaultActualPayload(customFields = []) {
  const entries = [];
  const seen = new Set();

  for (const f of customFields) {
    if (!f.include_in_leadbyte) continue;
    const lbKey = f.leadbyte_field_name || f.field_name;
    if (seen.has(lbKey)) continue;
    seen.add(lbKey);
    entries.push({ key: lbKey, token: f.field_name });
  }

  // phone_verified from HLR result (always included to match pass-through)
  if (!seen.has('phone_verified')) {
    entries.push({ key: 'phone_verified', token: 'phone_verified' });
    seen.add('phone_verified');
  }

  const obj = {};
  for (const e of entries) obj[e.key] = `{{${e.token}}}`;
  return JSON.stringify(obj, null, 2);
}

/**
 * ActualPayloadEditor
 *  - value: JSON string of the outbound payload template (with {{token}} placeholders)
 *  - onChange(newValue)
 *  - customFields: current custom fields (for "Generate from current fields")
 *
 * Always-visible, editable section. Two modes:
 *  - Form mode: add/edit/remove key-value rows where value is a {{token}} or literal
 *  - JSON mode: raw editable JSON
 */
export function ActualPayloadEditor({ value, onChange, customFields = [] }) {
  const [mode, setMode] = useState('form'); // 'form' | 'json'
  const [rows, setRows] = useState([]);
  const [jsonStr, setJsonStr] = useState(value || '{}');
  const [jsonError, setJsonError] = useState(null);

  // Parse value into rows whenever it changes externally (e.g., on open)
  useEffect(() => {
    syncFromValue(value);
  }, [value]);

  function syncFromValue(v) {
    const str = v || '{}';
    setJsonStr(str);
    try {
      const obj = JSON.parse(str);
      const parsed = Object.entries(obj).map(([key, val]) => ({
        key,
        val: typeof val === 'string' ? val : JSON.stringify(val),
      }));
      setRows(parsed);
      setJsonError(null);
    } catch {
      setRows([]);
      setJsonError('Invalid JSON');
    }
  }

  function emitRows(newRows) {
    setRows(newRows);
    const obj = {};
    for (const r of newRows) {
      if (!r.key) continue;
      // try to preserve non-string literals, but token placeholders are strings
      let val = r.val;
      if (val.startsWith('{{') && val.endsWith('}}')) {
        obj[r.key] = val;
      } else {
        // attempt to parse numbers/booleans, else keep as string
        if (val === 'true' || val === 'false') obj[r.key] = val === 'true';
        else if (val !== '' && !isNaN(Number(val))) obj[r.key] = Number(val);
        else obj[r.key] = val;
      }
    }
    const str = JSON.stringify(obj, null, 2);
    setJsonStr(str);
    setJsonError(null);
    onChange(str);
  }

  function emitJson(str) {
    setJsonStr(str);
    try {
      const obj = JSON.parse(str);
      const parsed = Object.entries(obj).map(([key, val]) => ({
        key,
        val: typeof val === 'string' ? val : JSON.stringify(val),
      }));
      setRows(parsed);
      setJsonError(null);
      onChange(str);
    } catch {
      setJsonError('Invalid JSON - fix to save');
    }
  }

  const updateRow = (i, field, val) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    emitRows(next);
  };

  const addRow = () => emitRows([...rows, { key: '', val: '' }]);

  const removeRow = (i) => emitRows(rows.filter((_, idx) => idx !== i));

  const generateDefault = () => {
    const str = buildDefaultActualPayload(customFields);
    syncFromValue(str);
    onChange(str);
    toast.success('Generated from current forwarded fields');
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-[13px] flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> Actual LeadByte Payload
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            The exact JSON sent to LeadByte. Use <code className="bg-muted px-1 rounded text-primary">{'{{token}}'}</code> for dynamic values.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode('form')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${mode === 'form' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Form
            </button>
            <button
              onClick={() => setMode('json')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${mode === 'json' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              JSON
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={generateDefault} className="gap-1.5 h-7">
            <Wand2 className="w-3.5 h-3.5" /> Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'form' && (
          <>
            <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[11px] text-muted-foreground font-medium px-1">
              <span>LeadByte Key</span><span>Value / Token</span><span />
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-start">
                <Input
                  value={row.key}
                  onChange={e => updateRow(i, 'key', e.target.value)}
                  placeholder="e.g. firstname"
                  className="bg-background font-mono text-[12px] h-9"
                />
                <Input
                  value={row.val}
                  onChange={e => updateRow(i, 'val', e.target.value)}
                  placeholder="{{firstname}} or literal"
                  className={`bg-background font-mono text-[12px] h-9 ${row.val.startsWith('{{') && row.val.endsWith('}}') ? 'text-primary' : 'text-foreground'}`}
                />
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} className="h-9 w-9 p-0 text-destructive hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Field
            </Button>
          </>
        )}
        {mode === 'json' && (
          <>
            <HighlightedPayloadEditor
              value={jsonStr}
              onChange={emitJson}
              minHeight={360}
              textClass="text-[12px]"
            />
            {jsonError && <p className="text-[11px] text-destructive">{jsonError}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ActualPayloadEditor;