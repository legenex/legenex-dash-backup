import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Base64url-encode a UTF-8 string (for the Gmail API `raw` field).
function base64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2047 B-encode non-ASCII header values (e.g. subjects with emoji/accents).
function encodeHeader(str) {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const auth = { Authorization: `Bearer ${accessToken}` };

    // Resolve the connected account address (used as From + shown in the modal).
    let from = '';
    try {
      const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: auth });
      if (pr.ok) from = (await pr.json()).emailAddress || '';
    } catch {}

    const to = String(body.to || '').trim();
    if (!to) return Response.json({ connected: true, from });

    const subject = String(body.subject || 'Test from Legenex');
    const text = String(body.body || '');

    const headers = [];
    if (from) headers.push(`From: ${from}`);
    headers.push(`To: ${to}`);
    headers.push(`Subject: ${encodeHeader(subject)}`);
    headers.push('MIME-Version: 1.0');
    headers.push('Content-Type: text/plain; charset=UTF-8');
    const rfc822 = headers.join('\r\n') + '\r\n\r\n' + text;

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64url(rfc822) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ success: false, from, error: data?.error?.message || `HTTP ${res.status}` });

    return Response.json({ success: true, from, id: data.id });
  } catch (error) {
    return Response.json({ error: error.message, connected: false }, { status: 500 });
  }
});