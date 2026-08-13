import { useEffect } from 'react';
import { toast } from 'sonner';

let lastFocusedTextarea = null;

const TRANSFORMS = [
  { suffix: '|lowercase', desc: 'Convert to lowercase' },
  { suffix: '|uppercase', desc: 'Convert to uppercase' },
  { suffix: '|trim', desc: 'Strip whitespace' },
  { suffix: '|sha256', desc: 'SHA-256 hash' },
  { suffix: '|phone_us', desc: 'US phone → 1XXXXXXXXXX' },
];

export function insertAtCursor(text) {
  const activeEl = document.activeElement;
  let el = null;
  if (activeEl && activeEl.tagName === 'TEXTAREA' && typeof activeEl.selectionStart === 'number') {
    el = activeEl;
  } else if (lastFocusedTextarea && document.body.contains(lastFocusedTextarea)) {
    el = lastFocusedTextarea;
    el.focus();
  }

  if (!el) {
    navigator.clipboard.writeText(text);
    toast.success('Copied: ' + text);
    return;
  }

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  const newValue = value.slice(0, start) + text + value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(el, newValue);
  else el.value = newValue;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange(start + text.length, start + text.length);
  el.focus();
}

export default function TransformsReference() {
  useEffect(() => {
    const handler = (e) => {
      if (e.target && e.target.tagName === 'TEXTAREA') {
        lastFocusedTextarea = e.target;
      }
    };
    document.addEventListener('focusin', handler);
    return () => document.removeEventListener('focusin', handler);
  }, []);

  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Transforms</div>
      <div className="space-y-1">
        {TRANSFORMS.map(t => (
          <div key={t.suffix} className="flex items-center gap-2">
            <code
              className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 shrink-0"
              onClick={() => insertAtCursor(t.suffix)}
              title={t.desc}
            >
              {t.suffix}
            </code>
            <span className="text-[10px] text-muted-foreground">{t.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}