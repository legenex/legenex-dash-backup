import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Shared (builder) connectors whose connection status the Integrations tab reports.
const INTEGRATION_TYPES = [
  'gmail',
  'googledrive',
  'googlesheets',
  'slack',
  'googlebigquery',
  'google_analytics',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const status = {};
    for (const type of INTEGRATION_TYPES) {
      try {
        await base44.asServiceRole.connectors.getConnection(type);
        status[type] = true;
      } catch {
        status[type] = false;
      }
    }
    try {
      const wc = await base44.asServiceRole.entities.IntegrationConfig.filter({ name: 'whatsapp' });
      status['whatsapp'] = !!wc[0];
    } catch {
      status['whatsapp'] = false;
    }
    for (const name of ['mercury', 'stripe', 'xero']) {
      try {
        const c = await base44.asServiceRole.entities.IntegrationConfig.filter({ name });
        status[name] = !!c[0];
      } catch {
        status[name] = false;
      }
    }

    return Response.json({ status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});