import React, { useState, useRef } from 'react';
import { Inbox, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PUBLIC_APPLICATION_URL } from '@/components/apply/applyConstants';

// Shown when there are no onboarding records. Explains where submissions come
// from and offers a copyable link to the public application form.
export default function OnboardingEmptyState() {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  // Canonical production application URL. Uses the shared constant rather than
  // the runtime origin, so the shared link is correct even inside the preview.
  const applyUrl = PUBLIC_APPLICATION_URL;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(applyUrl);
      } else if (inputRef.current) {
        // Fallback: select the field text so the operator can copy manually.
        inputRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (inputRef.current) inputRef.current.select();
    }
  };

  return (
    <div className="bg-card border border-border rounded-[12px] py-16 px-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">No onboarding submissions yet</h3>
      <p className="text-[13px] text-muted-foreground mt-2 max-w-md leading-relaxed">
        Submissions arrive from your public application form. Share the link below with a new buyer
        and their submission shows up here, brought live step by step.
      </p>

      <div className="mt-5 flex w-full max-w-md items-center gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={applyUrl}
          onFocus={(e) => e.target.select()}
          className="font-mono text-[12px] text-muted-foreground"
          aria-label="Public application form URL"
        />
        <Button type="button" variant="outline" onClick={handleCopy} className="gap-1.5 shrink-0">
          {copied ? <Check className="w-4 h-4 status-sold" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <a
        href={applyUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 font-mono text-[12px] text-primary hover:underline break-all"
      >
        {applyUrl}
      </a>
    </div>
  );
}