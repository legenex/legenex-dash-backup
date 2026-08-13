import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Common disposable/temporary email domains. Basic free check, no external dependency.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'trashmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'spambog.com',
  'maildrop.cc', 'getnada.com', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com',
  'temp-mail.org', 'emailondeck.com', 'mohmal.com', 'tempinbox.com', 'guerrillamail.info',
  'trashmail.me', 'trbvm.com', 'vomoto.com', 'copythismail.com', 'dayrep.com',
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const formatValid = emailRegex.test(email);
    const [localPart, domain] = email.split('@');

    let mxRecords = [];
    let dnsOk = false;
    let dnsError = null;

    if (formatValid && domain) {
      try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
        const data = await res.json();
        if (Array.isArray(data.Answer)) {
          mxRecords = data.Answer
            .filter(a => a.type === 15)
            .map(a => String(a.data || '').replace(/^\d+\s+/, '').replace(/\.$/, ''));
          dnsOk = mxRecords.length > 0;
        } else {
          dnsOk = false;
        }
      } catch (e) {
        dnsError = 'DNS lookup failed';
      }
    }

    const disposable = formatValid ? DISPOSABLE_DOMAINS.has(domain) : false;
    const freeProvider = formatValid ? ['gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','aol.com','icloud.com','proton.me','protonmail.com','zoho.com','gmx.com'].includes(domain) : false;

    let verdict = 'unknown';
    if (!formatValid) verdict = 'invalid_format';
    else if (disposable) verdict = 'disposable';
    else if (dnsError) verdict = 'lookup_failed';
    else if (!dnsOk) verdict = 'no_mx_records';
    else verdict = 'valid';

    return Response.json({
      email,
      local_part: localPart,
      domain,
      format: formatValid,
      disposable,
      free: freeProvider,
      dns: dnsOk,
      mx_records: mxRecords,
      verdict,
      dns_error: dnsError,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});