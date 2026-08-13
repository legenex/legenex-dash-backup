import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: operator-only. This proxies an arbitrary outbound HTTP request
// from the server, so it must be gated to operators (not portal accounts) and
// must refuse internal/link-local/metadata targets to avoid SSRF into private
// infrastructure.
const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

async function assertOperator(base44, user) {
  const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
  const caller = record || user;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions = {};
  try {
    permissions = typeof caller.permissions === 'string'
      ? JSON.parse(caller.permissions || '{}')
      : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// Block internal destinations. Defense in depth: rejects non-http(s) schemes,
// localhost/metadata/.internal names, and private/link-local/loopback/ULA/mapped
// IPs for both IPv4 and IPv6, including the IPs a DNS name resolves to (best
// effort, to blunt DNS rebinding). The fetch below also uses redirect:'manual'
// so a public URL cannot 3xx-redirect into an internal target.
function normalizeHost(h) {
  h = String(h || '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1); // strip IPv6 brackets
  if (h.endsWith('.')) h = h.slice(0, -1);                      // strip trailing dot
  return h;
}
function isPrivateIpv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;                 // link-local + 169.254.169.254 metadata
  if (a === 192 && b === 168) return true;                 // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;        // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;       // CGNAT 100.64.0.0/10
  return false;
}
function isPrivateIpv6(host) {
  if (!host.includes(':')) return false;
  if (host === '::1' || host === '::') return true;         // loopback / unspecified
  if (/^fe[89ab]/.test(host)) return true;                 // fe80::/10 link-local
  if (/^f[cd]/.test(host)) return true;                    // fc00::/7 unique local
  const mapped = host.match(/^::ffff:(.+)$/);              // IPv4-mapped
  if (mapped) return mapped[1].includes('.') ? isPrivateIpv4(mapped[1]) : true;
  return false;
}
function isPrivateHost(host) {
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  if (host === 'metadata.google.internal' || host === 'metadata') return true;
  return isPrivateIpv4(host) || isPrivateIpv6(host);
}
async function isBlockedTarget(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return true; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
  const host = normalizeHost(u.hostname);
  if (isPrivateHost(host)) return true;
  const isLiteralIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (!isLiteralIp && typeof Deno !== 'undefined' && Deno.resolveDns) {
    try {
      const lookups = await Promise.allSettled([
        Deno.resolveDns(host, 'A'),
        Deno.resolveDns(host, 'AAAA'),
      ]);
      for (const r of lookups) {
        if (r.status === 'fulfilled') {
          for (const ip of r.value) {
            if (isPrivateHost(normalizeHost(ip))) return true;
          }
        }
      }
    } catch { /* DNS resolution not permitted here; rely on operator gate + denylist + manual redirect */ }
  }
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await assertOperator(base44, user))) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { target_url, method, content_type, payload, headers } = await req.json();
    if (!target_url) return Response.json({ error: 'target_url is required' }, { status: 400 });
    if (await isBlockedTarget(target_url)) return Response.json({ error: 'target_url host is not allowed' }, { status: 400 });

    const hdrs = { 'Content-Type': content_type || 'application/json' };
    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (h && h.key) hdrs[h.key] = h.value ?? '';
      }
    }

    const resp = await fetch(target_url, {
      method: method || 'POST',
      headers: hdrs,
      body: payload == null ? '' : String(payload),
      redirect: 'manual', // do not follow redirects into internal targets
    });

    const respText = await resp.text();
    let body;
    try { body = JSON.parse(respText); } catch { body = respText; }

    return Response.json({
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok,
      body,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});