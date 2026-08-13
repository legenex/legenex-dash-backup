import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// DataBot: answers questions about the app's own data + a curated Knowledge Base.
// Uses OpenAI (OPENAI_API_KEY secret).
//
// ARCHITECTURE (rewritten 30 July 2026)
// -------------------------------------
// The previous version pre-computed every dimension against every period and
// stringified the lot into a single prompt. That payload ran well past 100k
// characters, so the model was doing needle-in-a-haystack retrieval and hedged
// with "the data does not specify" even when the number was present. Adding
// more instruction text could not fix a retrieval problem.
//
// This version is a two-pass query tool:
//   1. PLAN    a small model call turns the question into a structured query
//              spec (entity refs, group_by, period, top_n). No data in scope.
//   2. EXECUTE the spec runs deterministically here in TypeScript. Counting is
//              never done by the model.
//   3. NARRATE a second model call sees the question plus a small result object
//              (typically well under 4k characters) and writes the answer.
//
// Entity resolution is a real index: every supplier and buyer is registered
// under all of its aliases (name, sid, ssid, buyer_code, buyer id) and matched
// on word boundaries, so "Inbounds" no longer fires on the word "inbound".
//
// Counting rules, unchanged and matching the dashboard:
//   1. Archived leads are excluded. They are retired duplicates.
//   2. The event date is the supplier's own timestamp where present, NOT
//      created_date, which is only when the row was written.
//   3. Days bucket in America/Regina, the operating timezone.

// Delegates to the shared client: OpenAI first, automatic failover to
// Anthropic (ANTHROPIC_API_KEY) if OpenAI is unavailable for any reason.
// The name is kept so existing call sites are untouched.
async function callOpenAI({ prompt, system, model = 'gpt-4o-mini', temperature = 0.4, jsonSchema = null, images = [], maxTokens } = {}) {
  return await callLLM({ prompt, system, model, temperature, jsonSchema, images, maxTokens });
}

// A real inventory of the app, so target_files names things that exist instead
// of being invented. Static and will drift, so the build channel confirms it.
const APP_INVENTORY = `PAGES (src/pages/<Name>.jsx): ApiStatus, Apply, BuyerDetail, Campaigns, ConversionEvents, CustomCalculations, Deliveries, DistributionDashboard, ErrorLogs, Finances, ForgotPassword, Leads, LeadsRejections, LeadsView, Login, Notifications, Overview, PayloadTester, QueueRecovery, Register, Reports, ResetPassword, RouteGroups, RouteSimulator, Settings, SupplierDetail, Suppliers, ToolsDashboard, Verification

COMPONENT FOLDERS (src/components/<folder>/): admanager, apply, calculations, campaigns, databot, distribution, docs, finances, layout, leads, operations, overview, portal, progress, reports, settings, shared, suppliers, supplierportal, tools, ui, verification

BACKEND FUNCTIONS (base44/functions/<name>/entry.ts): processLead, leads, leadbyteWebhook, webhook, distributionConfig, distributionSetMode, distributionSimulate, distributionShadowReport, distributionInsights, campaignDeliveryTest, operationsData, operatorData, portalData, supplierPortalData, overviewBriefing, adManagerInsights, reconInsights, generateBillingRun, syncMetaSpend, syncMercury, syncStripe, syncXero, syncGoogleSheets, auditRun, dataBot, recomputeStateStatus, nightlyStateStatusRecompute, dedupeLeads, bulkDeleteLeads, onboardBuyer, submitBuyerOnboarding, allocateBuyerCode, testLeadByte, testLeadByteConnector, sendPayloadTest, health, spec, validate

SHARED LIBS: src/lib/fetchAll.js (pagination past the 500 row cap), src/lib/reportMetrics.js (analytics engine), src/lib/adManagerMetrics.js, src/lib/distribution/engine.js

DOCS: DESIGN-SYSTEM.md, docs/`;

// Scope a change request into a single-concern build prompt for the CONTROLLED
// channel (Claude via connector, Base44 builder, or Claude Code). Never executes.
async function draftBuildRequest(question, history, images = []) {
  const schema = {
    type: 'object',
    properties: {
      is_build: { type: 'boolean' },
      title: { type: 'string' },
      summary: { type: 'string' },
      target_files: { type: 'array', items: { type: 'string' } },
      do_not_touch: { type: 'array', items: { type: 'string' } },
      risk: { type: 'string', enum: ['green', 'amber', 'red'] },
      ready_prompt: { type: 'string' },
    },
    required: ['is_build', 'title', 'summary', 'ready_prompt'],
  };
  const convo = history.map((m) => `${m.role === 'user' ? 'User' : 'BuildBot'}: ${m.content}`).join('\n');
  const system = `You scope change requests for the Legenex Base44 app so they can be handed to a controlled build channel (Claude via the Base44 connector, the Base44 builder, or Claude Code). You NEVER execute changes yourself.

WHAT COUNTS AS A BUILD. Set is_build=true for ANY request to change the app: add, remove, disable, enable, turn off, turn on, change, edit, update, fix, create, build, rename, move, restyle, redesign, refactor, or wire something up. A screenshot attached with a complaint or a request about what is shown is also a build request. Set is_build=false ONLY when the message is purely a question about DATA (counts, revenue, performance, what happened) with no request to change anything.

CRITICAL, DO NOT REFUSE. A request touching a RED surface is still drafted. You mark it risk=red, put an explicit approval gate as the first line of ready_prompt, and describe the change precisely. You NEVER set is_build=false to avoid a sensitive request, and you never reply that you only handle analytics. Refusing to draft is a failure: the operator needs the scoped request in order to decide. Drafting is not doing.

RISK. red if it touches any RED surface: processLead, the four live LeadByteConnectors or their enabled states, Conversion Events, distribution_mode, credentials, live endpoints, billing records, buyer pricing or state coverage, TrustedForm behaviour, portal scoping. amber for schema changes, shared components, data writes, or anything backend. green only for isolated UI, copy, or docs.

DO_NOT_TOUCH IS NEVER EMPTY unless the change is a single isolated file. Name the adjacent surfaces the builder must leave alone. "None" is almost always wrong.

SCOPE. One concern per change. If the request is vague or sprawling ("redesign the dashboard"), narrow it to the smallest sensible first step and say in summary what you deliberately excluded. Never draft a change spanning many unrelated files.

CONVENTIONS to bake into ready_prompt: follow DESIGN-SYSTEM.md, semantic tokens only, never raw hex/hsl or raw palette utilities; additive schema only, no renames or deletions of live fields; create_checkpoint before any schema change or destructive edit; distribution_mode only ever via the distributionSetMode function, never a direct field write; no secrets; no em dashes anywhere; verify with the design token gate and lint, and confirm the rendered result in the live app.

ready_prompt must be complete and copy-pasteable: the approval gate if red, the target area, the exact change, the do-not-touch list, and the verification step.

TARGET FILES. Use the inventory below and name real paths. If you are unsure which file holds something, say so in target_files with a "confirm: " prefix rather than inventing a filename.

${APP_INVENTORY}`;
  const prompt = `Conversation so far:\n${convo || '(none)'}\n\nUser request: ${question}\n\nReturn JSON only.`;
  return await callOpenAI({ system, prompt, jsonSchema: schema, temperature: 0.2, images });
}

// Extract learnable facts from a conversation exchange. Returns up to 3 facts.
async function extractMemories(question, answer, existingMemory) {
  const schema = {
    type: 'object',
    properties: {
      memories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fact: { type: 'string', description: 'A concise, durable fact or preference learned from this exchange' },
            category: { type: 'string', enum: ['preference', 'business_rule', 'data_insight', 'definition', 'other'] },
          },
          required: ['fact', 'category'],
        },
      },
    },
    required: ['memories'],
  };
  const existingStr = existingMemory.slice(0, 20).map(m => `- ${m.fact}`).join('\n');
  const system = `You extract durable, reusable facts and preferences from a conversation between a user and an analytics assistant. Only extract facts that will be useful in future conversations: business rules, user preferences, recurring data insights, or definitions the user provided. Do NOT extract transient questions or answers. Do NOT duplicate facts already known.\n\nKnown memories:\n${existingStr || '(none)'}`;
  const prompt = `User asked: ${question}\nAssistant answered: ${answer}\n\nExtract up to 3 new memories. Return JSON only.`;
  try {
    const result = await callOpenAI({ system, prompt, jsonSchema: schema, temperature: 0.2 });
    return Array.isArray(result?.memories) ? result.memories.filter(m => m.fact && m.fact.length > 5).slice(0, 3) : [];
  } catch { return []; }
}

// ---- Query planner -------------------------------------------------------
//
// Turns a natural-language question into a structured spec. Sees only the
// entity directory and the list of valid options, never the lead data, so the
// prompt stays tiny and the call stays fast.
async function planQuery(question, history, directory) {
  const schema = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['aggregate', 'timeseries', 'compare', 'directory', 'finance', 'general'],
        description: 'aggregate for counts/economics, timeseries for per-day trends, compare for two or more named entities side by side, directory to list known suppliers/buyers, finance for ad spend or bank questions, general for knowledge-base or non-data questions',
      },
      entity_refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any supplier or buyer the question names, exactly as written by the user. Can be a name, sid, ssid, buyer_code or id. Empty if the question is not about specific entities.',
      },
      group_by: {
        type: 'string',
        enum: ['supplier', 'buyer', 'source', 'vertical', 'state', 'status', 'lead_type', 'day', 'none'],
        description: 'The dimension to break results down by. Use none for a single total.',
      },
      period: {
        type: 'string',
        enum: ['today', 'yesterday', 'this_week', 'last_week', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'all_time', 'custom'],
      },
      start_date: { type: 'string', description: 'YYYY-MM-DD, only when period is custom' },
      end_date: { type: 'string', description: 'YYYY-MM-DD, only when period is custom' },
      top_n: { type: 'integer', description: 'How many groups to return, default 15' },
      needs_finance: { type: 'boolean', description: 'True if the question touches ad spend, bank transactions, or where a money figure came from' },
    },
    required: ['intent', 'entity_refs', 'group_by', 'period'],
  };
  const convo = history.slice(-4).map((m) => `${m.role === 'user' ? 'User' : 'DataBot'}: ${String(m.content).slice(0, 300)}`).join('\n');
  const system = `You convert questions about a lead-management platform into a structured query spec. You never answer the question yourself and you never invent numbers.

Period mapping: "today"=today, "yesterday"=yesterday, "this week"/"week to date"/"so far this week"=this_week (the calendar week, Sunday to today), "last week"=last_week (the previous full calendar week), "past 7 days"/"last 7 days"/"the last week" as a rolling window=last_7_days, "last 30 days"=last_30_days, "this month"/"month to date"=this_month, "last month"=last_month, "overall"/"ever"/"in total"/"all time"=all_time. A specific date or date range is custom. When no period is stated, use all_time.

this_week and last_7_days are different windows and must not be treated as interchangeable. Prefer this_week when the user says "this week", and last_7_days only when they clearly mean a rolling seven day window.

entity_refs: copy the supplier or buyer token exactly as the user typed it. Do not correct spelling or casing, the resolver handles that. Only include tokens that plausibly name a supplier or buyer from the directory.

group_by: use the dimension the user is slicing by. "which supplier"/"by supplier"/"per supplier" is supplier. "best day"/"per day"/"trend" is day with intent timeseries. A plain count for one entity or overall is none.

Known suppliers and buyers:
${directory}`;
  const prompt = `Conversation so far:\n${convo || '(none)'}\n\nQuestion: ${question}\n\nReturn JSON only.`;
  return await callOpenAI({ system, prompt, jsonSchema: schema, temperature: 0 });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const question = (body.question || '').toString().trim();
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    // Attached screenshots, as [{ media_type, data }] with data base64 encoded.
    // Capped at four, and each one is checked for a plausible size so a stray
    // paste cannot blow the request up.
    const images = (Array.isArray(body.images) ? body.images : [])
      .filter((i) => i && typeof i.data === 'string' && i.data.length > 32 && i.data.length < 8_000_000)
      .slice(0, 4)
      .map((i) => ({ media_type: String(i.media_type || 'image/png'), data: i.data }));
    // An image on its own is a valid message: "fix this" with a screenshot.
    if (!question && !images.length) return Response.json({ error: 'No question provided' }, { status: 400 });

    const isAdmin = user.role === 'admin' || user.role === 'owner';
    const mode = body.mode === 'build' ? 'build' : 'data';

    // list() returns null for empty entities, so never trust the shape.
    const arr = (x) => (Array.isArray(x) ? x : []);

    // Resolve DataBot/BuildBot access from the permission model: explicit perms
    // when the user has any stored, otherwise the role default. Owner always
    // has all permissions (mirrors the frontend usePermissions hook).
    const resolvePerms = (u) => {
      const role = u.base_role || u.role;
      let p = {};
      try { p = u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions) : {}; } catch { p = {}; }
      // databot is on by default for all roles; only off if explicitly set to false
      const databot = p.databot === false ? false : true;
      // buildbot: on for owner/admin by default, off for partners
      const buildbotDefault = (role === 'owner' || role === 'admin');
      const buildbot = p.buildbot !== undefined ? !!p.buildbot : buildbotDefault;
      return { databot, buildbot };
    };
    const isPartner = user.base_role === 'supplier' || user.base_role === 'buyer' || !!user.linked_supplier_id || !!user.linked_buyer_id;
    const perms = resolvePerms(user);
    const svc = base44.asServiceRole;

    // Per-bot allow list, configured on the bot itself in Settings > ChatBot.
    //
    // When allowed_roles or allowed_user_ids is set, the bot is restricted to
    // exactly those and nothing else grants access. When both are empty it
    // returns null and the permission flag below decides, which is how it
    // behaved before, so an unconfigured bot keeps working for owners/admins.
    //
    // Resolved BEFORE any work happens. Enforced server side: the UI hides the
    // launcher too, but hiding a button is not access control.
    const botAllows = async (botKey: string, u: any) => {
      try {
        const cfgs = await svc.entities.BotConfig.filter({ bot_key: botKey });
        const cfg = arr(cfgs)[0] || null;
        if (!cfg) return null;
        const roles = arr(cfg.allowed_roles).filter(Boolean);
        const ids = arr(cfg.allowed_user_ids).filter(Boolean);
        if (roles.length === 0 && ids.length === 0) return null; // not configured
        const role = String(u.base_role || u.role || '').toLowerCase();
        return roles.map((r: string) => String(r).toLowerCase()).includes(role) || ids.includes(u.id);
      } catch {
        return null; // never lock an operator out because a lookup failed
      }
    };

    const buildAllow = await botAllows('build', user);
    const dataAllow = await botAllows('data', user);

    // An explicit allow list overrides the permission flag in both directions.
    const canData = dataAllow === null ? !!perms.databot : dataAllow;
    const canBuild = !isPartner && (buildAllow === null ? !!perms.buildbot : buildAllow);

    // Friendly, actionable message instead of a silent 500 when the key is unset.
    if (!Deno.env.get('OPENAI_API_KEY')) {
      return Response.json({ type: 'answer', answer: 'This assistant is not configured yet: the OPENAI_API_KEY secret is missing. An admin can add it in the app secrets, then I can answer.' });
    }

    // BuildBot: draft a single-concern build request for the controlled channel.
    if (mode === 'build') {
      if (!canBuild) {
        return Response.json({
          type: 'answer',
          answer: buildAllow === false
            ? 'BuildBot is restricted to specific roles or people, and your account is not on that list. An admin can change this in Settings > ChatBot > BuildBot.'
            : 'BuildBot is not enabled for your account. An admin can grant the BuildBot permission in Users and Roles.',
        });
      }
      try {
        const draft = await draftBuildRequest(question || 'See the attached screenshot and scope the change it implies.', history, images);
        if (draft && draft.is_build) return Response.json({ type: 'build_request', build_request: draft });
      } catch (_) { /* not a build, or draft failed: fall through to an answer */ }
    }

    if (!canData) {
      return Response.json({
        type: 'answer',
        answer: dataAllow === false
          ? 'DataBot is restricted to specific roles or people, and your account is not on that list. An admin can change this in Settings > ChatBot > DataBot.'
          : 'DataBot access is turned off for your account. An admin can enable it in Users and Roles.',
      });
    }

    // --- Load conversation history and memories for context ---
    let pastConversations: any[] = [];
    let memories: any[] = [];
    let conversationId: string | null = body.conversation_id || null;

    try {
      // Load recent active memories (learned facts) for this user.
      memories = arr(await svc.entities.ChatMemory.filter(
        { user_id: user.id, active: true },
        '-created_date', 30
      ).catch(() => []));
      // Load recent conversations for continuity (titles + last few messages).
      const recentConvs = arr(await svc.entities.ChatConversation.filter(
        { user_id: user.id, mode, active: true },
        '-last_message_at', 5
      ).catch(() => []));
      pastConversations = recentConvs.map(c => {
        let msgs = [];
        try { msgs = JSON.parse(c.messages || '[]'); } catch { /* malformed history is not fatal */ }
        // Only the user's own questions are carried forward, never past
        // assistant answers. Old answers contain figures that were correct for
        // a different question, and the model will happily reuse them instead
        // of reading the result block. This is topic continuity, not a data
        // source. The current thread's history is passed separately and is the
        // only conversational context that may inform an answer.
        return {
          title: c.title,
          recent: msgs.filter((m) => m.role === 'user')
            .slice(-3)
            .map((m) => `asked: ${typeof m.content === 'string' ? m.content.slice(0, 160) : ''}`),
        };
      }).filter((c) => c.recent.length);
    } catch { /* memory entities may not exist yet */ }

    // --- Resolve caller scope (deny-by-default), then gather only what they may see ---
    let scope = { kind: 'none', id: null };
    if (isAdmin) scope = { kind: 'operator', id: null };
    else if (user.base_role === 'supplier' || user.linked_supplier_id) scope = { kind: 'supplier', id: user.linked_supplier_id || null };
    else if (user.base_role === 'buyer' || user.linked_buyer_id) scope = { kind: 'buyer', id: user.linked_buyer_id || null };

    const sum = (a, f) => a.reduce((acc, x) => acc + (Number(f(x)) || 0), 0);
    const statusMap = (rows) => { const m = {}; for (const l of rows) m[l.final_status] = (m[l.final_status] || 0) + 1; return m; };

    const APP_TZ = 'America/Regina';
    const dayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const parseBag = (l) => {
      try { return JSON.parse(l?.mapped_fields || '{}') || {}; } catch { return {}; }
    };

    // Mirrors leadEventInstant in src/lib/reportMetrics.js exactly, so DataBot
    // and the Leads page can never disagree about which day a lead lands on.
    //
    // Only ISO-shaped timestamps are honoured. US-format strings like
    // "07/30/2026 05:26:44" are ignored on purpose and fall through to
    // created_date, which is what the dashboard does. A naive ISO string is a
    // wall clock in APP_TZ, not UTC. Regina is UTC-6 year round with no DST, so
    // the offset can be pinned literally rather than importing date-fns-tz,
    // which is not available to a Deno function.
    const APP_TZ_OFFSET = '-06:00';
    const eventDayKey = (l) => {
      const bag = parseBag(l);
      const ts = bag.timestamp;
      let d = null;
      if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(ts.trim())) {
        const raw = ts.trim().replace(' ', 'T');
        const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
        const parsed = new Date(hasZone ? raw : `${raw}${APP_TZ_OFFSET}`);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      if (!d) {
        const c = l?.created_date;
        if (!c) return null;
        const s = String(c).trim();
        d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`);
      }
      return isNaN(d.getTime()) ? null : dayFmt.format(d);
    };

    const todayKey = dayFmt.format(new Date());
    const dayKeyOffset = (n) => dayFmt.format(new Date(Date.now() - n * 86400000));
    const yesterdayKey = dayKeyOffset(1);

    // Page past the 500-row cap so totals are real totals.
    const loadAllLeads = async () => {
      const out = [];
      const pageSize = 500;
      for (let p = 0; p < 400; p += 1) {
        const batch = arr(await svc.entities.Lead
          .filter({ archived: false }, '-created_date', pageSize, p * pageSize)
          .catch(() => []));
        if (batch.length === 0) break;
        out.push(...batch);
        if (batch.length < pageSize) break;
      }
      return out;
    };

    const leadCostOf = (l) => {
      const bag = parseBag(l);
      const v = bag.cpl ?? bag.cost ?? null;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    // Full economics for a set of leads. Same definitions as the dashboard:
    // CPL is cost per SOLD lead, conversion is sold over total received.
    const econ = (rows) => {
      const byStatus = statusMap(rows);
      const sold = byStatus.Sold || 0;
      const revenue = Math.round(sum(rows, (l) => l.revenue));
      const cost = Math.round(sum(rows, leadCostOf));
      return {
        total: rows.length,
        sold,
        unsold: byStatus.Unsold || 0,
        disqualified: byStatus.Disqualified || 0,
        returned: byStatus.Returned || 0,
        rejected: byStatus.Rejected || 0,
        duplicate: byStatus.Duplicate || 0,
        revenue,
        lead_cost: cost,
        profit: revenue - cost,
        margin_pct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
        cpl: sold > 0 ? Math.round((cost / sold) * 100) / 100 : 0,
        rev_per_sold: sold > 0 ? Math.round((revenue / sold) * 100) / 100 : 0,
        conv_rate_pct: rows.length > 0 ? Math.round((sold / rows.length) * 1000) / 10 : 0,
      };
    };

    let payload: any = {};
    let kbContext = '';
    let scopeNote = '';
    let planNote = '';

    if (scope.kind === 'operator') {
      const [leads, suppliersRaw, buyersRaw, adSpendRaw, txnsRaw, kbDocsRaw] = await Promise.all([
        loadAllLeads(),
        svc.entities.Supplier.list().catch(() => []),
        svc.entities.Buyer.list().catch(() => []),
        svc.entities.AdSpend.list('-date', 500).catch(() => []),
        svc.entities.BankTransaction.list('-date', 300).catch(() => []),
        svc.entities.KnowledgeDoc.filter({ active: true }, 'sort_order').catch(() => []),
      ]);
      const suppliers = arr(suppliersRaw);
      const buyers = arr(buyersRaw);
      const adSpend = arr(adSpendRaw);
      const txns = arr(txnsRaw);
      const kbDocs = arr(kbDocsRaw);

      // ---- Entity index --------------------------------------------------
      //
      // Every supplier and buyer is registered under all of its aliases, so a
      // question can use a name, a sid, an ssid, a buyer_code or a raw id and
      // land on the same record. Matching is normalized (case and punctuation
      // insensitive) and, when scanning free text, anchored on word boundaries
      // so a short alias cannot fire on a substring of an unrelated word.
      const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      const aliasIndex = new Map<string, any>();
      const registry: any[] = [];

      const register = (rec) => {
        registry.push(rec);
        for (const a of rec.aliases) {
          const n = norm(a);
          if (n.length >= 2 && !aliasIndex.has(n)) aliasIndex.set(n, rec);
        }
      };

      for (const s of suppliers) {
        const aliases = [s.name, s.sid, s.ssid, s.code, s.supplier_code].filter(Boolean).map(String);
        if (!aliases.length) continue;
        register({ type: 'supplier', id: s.id, display: s.name, sid: s.sid || null, ssid: s.ssid || null, aliases });
      }
      for (const b of buyers) {
        const aliases = [b.company_name, b.name, b.buyer_code, b.id].filter(Boolean).map(String);
        if (!aliases.length) continue;
        register({ type: 'buyer', id: b.id, display: b.company_name || b.name, buyer_code: b.buyer_code || null, aliases });
      }

      // Real-column lookups, corrected against live data on 30 July 2026.
      //
      // Lead.buyer_id holds the buyer CODE ("AG1", "NW2", "LF3"), NOT a Base44
      // record id, so buyer_code is the join key. Lead.supplier_name is correct
      // on all but a couple of rows, but sids carry suffixes in the wild
      // ("INBNDS-SURVEY" belongs to Inbounds/INBNDS), so supplier resolution
      // falls back to a longest-prefix sid match rather than exact equality.
      const buyerByCode = new Map<string, any>();
      for (const b of buyers) {
        const name = String(b.company_name || b.name || '').trim();
        if (b.buyer_code) buyerByCode.set(norm(b.buyer_code), { name, id: b.id, code: b.buyer_code });
      }
      const supplierByName = new Map<string, string>();
      const supplierSids: Array<{ code: string; name: string }> = [];
      for (const s of suppliers) {
        const name = String(s.name || '').trim();
        if (name) supplierByName.set(norm(name), name);
        if (s.sid) supplierSids.push({ code: norm(s.sid), name });
      }
      // Longest sid first so INBNDS-SURVEY cannot be stolen by a shorter code.
      supplierSids.sort((a, b) => b.code.length - a.code.length);

      // ---- Dimensions ----------------------------------------------------
      const dimSupplier = (l) => {
        const bag = parseBag(l);
        const direct = String(l?.supplier_name || bag.supplier_name || '').trim();
        if (direct && supplierByName.has(norm(direct))) return supplierByName.get(norm(direct)) as string;
        const code = norm(bag.sid || bag.ssid || '');
        if (code) {
          const hit = supplierSids.find((s) => s.code && (code === s.code || code.startsWith(s.code)));
          if (hit) return hit.name;
        }
        return direct || String(bag.sid || '').trim() || '(unattributed)';
      };
      // Buyer joins on Lead.buyer_id === Buyer.buyer_code, then falls back to
      // the real buyer_name column, then the bag. The old version read bag.buyer
      // as both the name and the id, which is why buyer questions were flaky.
      const dimBuyer = (l) => {
        const code = norm(l?.buyer_id || '');
        if (code && buyerByCode.has(code)) return buyerByCode.get(code).name;
        const bag = parseBag(l);
        return String(l?.buyer_name || bag.buyer_name || '').trim() || '(unsold or unassigned)';
      };
      const dimSource = (l) => {
        const bag = parseBag(l);
        return String(bag.utm_source || bag.source || bag['Supplier Source'] || bag.lead_source || '').trim() || '(unknown source)';
      };
      const dimVertical = (l) => {
        const bag = parseBag(l);
        return String(bag.vertical || bag.lead_vertical || '').trim() || '(unset)';
      };
      const dimState = (l) => {
        const bag = parseBag(l);
        return String(l?.state || bag.accident_state || bag.geoip_state || '').trim().toUpperCase() || '(unknown)';
      };
      const dimStatus = (l) => String(l?.final_status || '(unset)');
      // lead_type: newer rows carry it explicitly in the bag. Otherwise apply
      // the sid rule, LEADFLOW and LGNX are Quiz, everything else Affiliate.
      const dimLeadType = (l) => {
        const bag = parseBag(l);
        const explicit = String(bag.lead_type || '').trim();
        if (explicit) return explicit;
        const code = norm(bag.sid || bag.ssid || l?.supplier_name || '');
        return (code.startsWith('leadflow') || code.startsWith('lgnx')) ? 'Quiz' : 'Affiliate';
      };
      const dimDay = (l) => eventDayKey(l) || '(undated)';

      const dimensions = {
        supplier: dimSupplier, buyer: dimBuyer, source: dimSource,
        vertical: dimVertical, state: dimState, status: dimStatus,
        lead_type: dimLeadType, day: dimDay,
      };

      // Does a record's alias appear in the question as a whole word?
      const mentionsAlias = (q, alias) => {
        const a = String(alias).trim();
        if (a.length < 2) return false;
        const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(q);
      };

      const resolveRef = (ref) => {
        const n = norm(ref);
        if (!n) return null;
        if (aliasIndex.has(n)) return aliasIndex.get(n);
        // Fall back to the longest alias contained in the reference.
        let best = null; let bestLen = 0;
        for (const [alias, rec] of aliasIndex) {
          if (alias.length > bestLen && (n.includes(alias) || alias.includes(n)) && alias.length >= 4) {
            best = rec; bestLen = alias.length;
          }
        }
        return best;
      };

      // Anything the planner missed, catch by scanning the question directly.
      const scanQuestion = (q) => {
        const found: any[] = [];
        for (const rec of registry) {
          if (rec.aliases.some((a) => mentionsAlias(q, a))) found.push(rec);
        }
        return found;
      };

      // ---- Period resolution ---------------------------------------------
      // Calendar week runs Sunday to Saturday, the US convention, and the
      // result labels it so an answer can state the assumption. Regina has no
      // DST so day offsets are exact arithmetic.
      const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, weekday: 'short' });
      const dowIndex = () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayFmt.format(new Date()));

      const allDayKeys = () => null; // null means no date filter
      const periodDays = (period, start, end) => {
        if (period === 'all_time') return allDayKeys();
        if (period === 'today') return [todayKey];
        if (period === 'yesterday') return [yesterdayKey];
        if (period === 'this_week') {
          const n = Math.max(dowIndex(), 0);
          return Array.from({ length: n + 1 }, (_, i) => dayKeyOffset(i));
        }
        if (period === 'last_week') {
          const n = Math.max(dowIndex(), 0);
          return Array.from({ length: 7 }, (_, i) => dayKeyOffset(n + 1 + i));
        }
        if (period === 'last_7_days') return Array.from({ length: 7 }, (_, i) => dayKeyOffset(i));
        if (period === 'last_30_days') return Array.from({ length: 30 }, (_, i) => dayKeyOffset(i));
        if (period === 'this_month') return { prefix: todayKey.slice(0, 7) };
        if (period === 'last_month') {
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
          return { prefix: dayFmt.format(d).slice(0, 7) };
        }
        if (period === 'custom' && start) {
          const from = new Date(`${start}T12:00:00Z`);
          const to = new Date(`${(end || start)}T12:00:00Z`);
          if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
          const days: string[] = [];
          for (let t = from.getTime(); t <= to.getTime() && days.length < 400; t += 86400000) {
            days.push(dayFmt.format(new Date(t)));
          }
          return days;
        }
        return null;
      };

      const inPeriod = (l, spec) => {
        if (spec === null) return true;
        const k = eventDayKey(l);
        if (!k) return false;
        if (Array.isArray(spec)) return spec.includes(k);
        if (spec && spec.prefix) return k.startsWith(spec.prefix);
        return true;
      };

      // ---- Plan ------------------------------------------------------------
      const directory = [
        `Suppliers: ${suppliers.slice(0, 60).map((s) => `${s.name}${s.sid ? ` (sid ${s.sid})` : ''}`).join(', ') || '(none)'}`,
        `Buyers: ${buyers.slice(0, 60).map((b) => `${b.company_name || b.name}${b.buyer_code ? ` (code ${b.buyer_code})` : ''}`).join(', ') || '(none)'}`,
      ].join('\n');

      let plan: any = null;
      try { plan = await planQuery(question, history, directory); } catch { plan = null; }
      if (!plan || typeof plan !== 'object') {
        plan = { intent: 'aggregate', entity_refs: [], group_by: 'none', period: 'all_time' };
      }

      const qLower = question.toLowerCase();

      // Deterministic period inference, and it OVERRIDES the planner.
      //
      // The planner has been observed returning all_time for a question that
      // said "this month", after which the narrator reported a June date as
      // this month's best day. The date was real, the window was not. When the
      // question names a window in plain words, that wording is authoritative.
      const inferPeriod = () => {
        const pats: Array<[RegExp, string]> = [
          [/\blast month\b|\bprevious month\b/, 'last_month'],
          [/\bthis month\b|\bmonth to date\b|\bmtd\b|\bcurrent month\b/, 'this_month'],
          [/\blast week\b|\bprevious week\b/, 'last_week'],
          [/\bthis week\b|\bweek to date\b|\bso far this week\b/, 'this_week'],
          [/\blast 30 days\b|\bpast 30 days\b|\blast thirty days\b/, 'last_30_days'],
          [/\blast 7 days\b|\bpast 7 days\b|\blast seven days\b/, 'last_7_days'],
          [/\byesterday\b/, 'yesterday'],
          [/\btoday\b/, 'today'],
          [/\ball ?time\b|\boverall\b|\bever\b|\bin total\b|\bto date\b/, 'all_time'],
        ];
        for (const [re, p] of pats) if (re.test(qLower)) return p;
        return null;
      };
      const textPeriod = inferPeriod();
      const period = textPeriod || plan.period || 'all_time';
      const daySpec = periodDays(period, plan.start_date, plan.end_date);
      const topN = Math.min(Math.max(Number(plan.top_n) || 15, 1), 40);

      // Deterministic fallback for the slice dimension.
      //
      // The planner returns group_by=none often enough that relying on it alone
      // loses the breakdown and the answer degrades to a bare period total. The
      // question text itself is unambiguous in these cases, so it is read
      // directly. This only ever fills a gap: an explicit planner choice wins.
      const inferGroup = () => {
        const pats: Array<[RegExp, string]> = [
          [/\b(?:by|per|across|each)\s+states?\b|\bwhich states?\b|\btop states?\b|\bstate breakdown\b/, 'state'],
          [/\b(?:by|per|each)\s+day\b|\bdaily\b|\bwhich day\b|\b(?:best|worst) day\b|\btrend\b|\bover time\b|\bday by day\b/, 'day'],
          [/\b(?:by|per|across|each)\s+buyers?\b|\bwhich buyers?\b|\btop buyers?\b|\bworst buyers?\b|\bbuyer breakdown\b/, 'buyer'],
          [/\b(?:by|per|across|each)\s+suppliers?\b|\bwhich suppliers?\b|\btop suppliers?\b|\bworst suppliers?\b|\bsupplier breakdown\b/, 'supplier'],
          [/\b(?:by|per|across|each)\s+sources?\b|\bwhich sources?\b|\btop sources?\b/, 'source'],
          [/\b(?:by|per|across|each)\s+verticals?\b|\bwhich vertical\b|\bmva vs\b|\bwc vs\b/, 'vertical'],
          [/\b(?:by|per|across|each)\s+status\b|\bstatus breakdown\b/, 'status'],
          [/\blead type\b|\bquiz vs\b|\bvs affiliate\b|\baffiliate vs\b/, 'lead_type'],
        ];
        for (const [re, dim] of pats) if (re.test(qLower)) return dim;
        return null;
      };
      let groupKey = plan.group_by && plan.group_by !== 'none' ? plan.group_by : null;
      let groupInferred = false;
      if (!groupKey) {
        const g = inferGroup();
        if (g) { groupKey = g; groupInferred = true; }
      }

      // Same treatment for the finance flag, which the planner also under-sets.
      const needsFinance = !!plan.needs_finance || plan.intent === 'finance'
        || /\b(?:ad ?spend|spend|cost|costs|profit|margin|money|losing|revenue|bank|cash|cpl|roi|payout)\b/.test(qLower);

      // Resolve entities from the plan, then top up from a direct scan.
      const resolved: any[] = [];
      const seen = new Set<string>();
      for (const ref of arr(plan.entity_refs)) {
        const rec = resolveRef(ref);
        if (rec && !seen.has(`${rec.type}:${rec.id}`)) { resolved.push(rec); seen.add(`${rec.type}:${rec.id}`); }
      }
      for (const rec of scanQuestion(question)) {
        if (!seen.has(`${rec.type}:${rec.id}`)) { resolved.push(rec); seen.add(`${rec.type}:${rec.id}`); }
      }

      // Both sides go through the same dimension resolver, so a lead posted as
      // sid INBNDS-SURVEY matches the Inbounds record and a lead with buyer_id
      // AG1 matches Walker Advertising.
      const matchesEntity = (l, rec) => {
        if (rec.type === 'supplier') return norm(dimSupplier(l)) === norm(rec.display);
        const code = norm(l?.buyer_id || '');
        if (code && rec.buyer_code && code === norm(rec.buyer_code)) return true;
        return norm(dimBuyer(l)) === norm(rec.display);
      };

      // ---- Execute ---------------------------------------------------------
      const periodRows = leads.filter((l) => inPeriod(l, daySpec));

      // The actual day range covered, so no answer can name a date outside it.
      const coveredKeys = periodRows.map(eventDayKey).filter(Boolean).sort();
      const undatedInPeriod = leads.filter((l) => !eventDayKey(l)).length;

      const result: any = {
        timezone: APP_TZ,
        today_date: todayKey,
        yesterday_date: yesterdayKey,
        week_convention: 'this_week is the calendar week running Sunday through today. last_7_days is a rolling seven day window ending today. They are deliberately different.',
        period_requested: period,
        period_source: textPeriod ? 'taken from the words used in the question' : 'chosen by the planner',
        period_bounds: coveredKeys.length
          ? { earliest_day: coveredKeys[0], latest_day: coveredKeys[coveredKeys.length - 1] }
          : null,
        period_row_count: periodRows.length,
        totals_for_period: econ(periodRows),
        cost_basis: 'lead_cost, profit, margin_pct and cpl are built from per-lead cost fields ONLY. Internal suppliers (LeadFlow, Legenex) never carry a per-lead price: their real cost is ad spend, and LeadFlow settles as a 30 percent profit share of window revenue minus window cost. So any margin, profit or CPL figure covering internal supply EXCLUDES the real cost base and overstates profitability, often severely. Never present those figures as settled without saying what they exclude.',
        leads_with_no_event_date: undatedInPeriod,
      };
      if (period === 'custom') {
        result.period_dates = { from: plan.start_date || null, to: plan.end_date || plan.start_date || null };
      }

      // Per-entity figures, always across the standard periods so a follow-up
      // question about a different window is already covered.
      if (resolved.length) {
        const stdPeriods = ['today', 'yesterday', 'this_week', 'last_week', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'all_time'];
        result.entities = resolved.slice(0, 6).map((rec) => {
          const rows = leads.filter((l) => matchesEntity(l, rec));
          const out: any = {
            type: rec.type,
            name: rec.display,
            matched_on: rec.aliases,
            id: rec.id,
          };
          if (rec.type === 'supplier') { out.sid = rec.sid; out.ssid = rec.ssid; }
          else { out.buyer_code = rec.buyer_code; }
          for (const p of stdPeriods) {
            out[p] = econ(rows.filter((l) => inPeriod(l, periodDays(p))));
          }
          // Always echo the exact window that was asked about, so there is
          // never a gap between the user's wording and a key in this object.
          out.requested_period = { resolved_to: period, ...econ(rows.filter((l) => inPeriod(l, daySpec))) };
          return out;
        });
        result.entity_note = 'These entities were resolved from the question by name, sid, ssid, buyer_code or id. Their figures are authoritative. Answer from here.';
      } else if (arr(plan.entity_refs).length) {
        result.unresolved_refs = plan.entity_refs;
        result.entity_note = 'The question named something that did not match any known supplier or buyer. Say so and list the closest names from the directory.';
      }

      // Grouped breakdown, scoped to the resolved entities when there are any.
      if (groupKey && dimensions[groupKey]) {
        const base = resolved.length
          ? periodRows.filter((l) => resolved.some((rec) => matchesEntity(l, rec)))
          : periodRows;
        const buckets: Record<string, any[]> = {};
        for (const l of base) {
          const k = dimensions[groupKey](l);
          if (!buckets[k]) buckets[k] = [];
          buckets[k].push(l);
        }
        const entries = Object.entries(buckets);
        const isDay = groupKey === 'day';
        // A day series must keep the most RECENT days, then read chronologically.
        // Sorting ascending and slicing kept the oldest, which is the opposite
        // of what any trend question wants.
        const effTopN = isDay ? Math.min(Math.max(topN, 31), 40) : topN;
        entries.sort((a, b) => (isDay ? b[0].localeCompare(a[0]) : b[1].length - a[1].length));
        const picked = entries.slice(0, effTopN);
        if (isDay) picked.sort((a, b) => a[0].localeCompare(b[0]));
        result.group_by = groupKey;
        result.group_by_source = groupInferred ? 'inferred from the question text' : 'chosen by the planner';
        result.group_count_total = entries.length;
        result.group_keys_present = entries.map(([k]) => k);
        result.groups = picked.reduce((acc, [k, v]) => { acc[k] = econ(v); return acc; }, {});
        if (entries.length > effTopN) result.groups_truncated = `showing ${effTopN} of ${entries.length}, ranked by volume`;
      }

      // Data quality probe, answered directly rather than left to a breakdown.
      if (/\bunattributed\b|\bno supplier\b|\bmissing supplier\b|\bno state\b|\bmissing state\b|\bunknown state\b|\bblank\b|\bdata quality\b|\bunassigned\b/.test(qLower)) {
        const noSupplier = periodRows.filter((l) => dimSupplier(l) === '(unattributed)');
        const noState = periodRows.filter((l) => dimState(l) === '(unknown)');
        const noBuyer = periodRows.filter((l) => dimBuyer(l) === '(unsold or unassigned)');
        const srcOf = (rows) => {
          const m: Record<string, number> = {};
          for (const l of rows) { const k = dimSource(l); m[k] = (m[k] || 0) + 1; }
          return m;
        };
        result.data_quality = {
          no_supplier_attribution: { count: noSupplier.length, by_source: srcOf(noSupplier) },
          no_state: { count: noState.length, by_supplier: (() => { const m: Record<string, number> = {}; for (const l of noState) { const k = dimSupplier(l); m[k] = (m[k] || 0) + 1; } return m; })() },
          no_buyer_assigned: { count: noBuyer.length },
          no_event_date: undatedInPeriod,
          _note: 'Counts are within the requested period. Zero is a real answer and means the field is fully populated.',
        };
      }

      // Always give the model the standard windows as a cheap safety net.
      result.overall = {
        today: econ(leads.filter((l) => inPeriod(l, periodDays('today')))),
        yesterday: econ(leads.filter((l) => inPeriod(l, periodDays('yesterday')))),
        last_7_days: econ(leads.filter((l) => inPeriod(l, periodDays('last_7_days')))),
        this_month: econ(leads.filter((l) => inPeriod(l, periodDays('this_month')))),
        all_time: econ(leads),
      };

      if (plan.intent === 'directory' || result.unresolved_refs) {
        result.directory = {
          suppliers: suppliers.slice(0, 60).map((s) => ({ name: s.name, sid: s.sid || null, ssid: s.ssid || null })),
          buyers: buyers.slice(0, 60).map((b) => ({ name: b.company_name || b.name, buyer_code: b.buyer_code || null, id: b.id })),
        };
      }

      if (needsFinance) {
        const acct = adSpend.filter((r) => !r.level || r.level === 'account');
        const rollup = (keyFn) => {
          const m = {};
          for (const r of acct) { const k = keyFn(r) || '(unknown)'; m[k] = Math.round(((m[k] || 0) + (Number(r.spend) || 0)) * 100) / 100; }
          return m;
        };
        const ds = adSpend.map((r) => r.date).filter(Boolean).sort();
        result.finance = {
          _note: 'Ad spend is deduplicated to account level only, so campaign and ad rows are not double counted.',
          ad_spend_total: Math.round(sum(acct, (a) => a.spend)),
          by_supplier: rollup((r) => r.supplier_name),
          by_account: rollup((r) => r.cost_source || r.ad_account_id),
          by_month: rollup((r) => String(r.date || '').slice(0, 7)),
          date_range: ds.length ? { earliest: ds[0], latest: ds[ds.length - 1], rows: ds.length } : null,
          recent_days: acct.slice(0, 45).map((r) => ({ date: r.date, spend: Number(r.spend) || 0, supplier: r.supplier_name || '', account: r.cost_source || r.ad_account_id || '' })),
          bank_money_in: Math.round(sum(txns.filter((t) => t.amount > 0), (t) => t.amount)),
          bank_money_out: Math.round(sum(txns.filter((t) => t.amount < 0), (t) => t.amount)),
          bank_unmatched: txns.filter((t) => !t.reconciled).length,
        };
      }

      payload = result;
      planNote = `Query plan: intent=${plan.intent}, period=${period}, group_by=${groupKey || 'none'}, entities=${resolved.map((r) => r.display).join(', ') || 'none'}.`;
      kbContext = kbDocs.map((d) => { const head = d.kind === 'glossary' ? `${d.term || d.title}` : d.title; return `[${d.kind}] ${head}: ${d.content || ''}`; }).join('\n');
    } else if (scope.kind === 'supplier') {
      // Portal scoping is a protected surface. This branch is unchanged.
      const supplier = scope.id ? await svc.entities.Supplier.get(scope.id).catch(() => null) : null;
      if (!supplier) { scope = { kind: 'none', id: null }; }
      else {
        const leads = arr(await svc.entities.Lead.filter({ supplier_name: supplier.name }, '-created_date', 3000).catch(() => []));
        const leadIds = new Set(leads.map((l) => l.id));
        let returnsTotal = 0;
        try { const rr = arr(await svc.entities.ReturnRequest.list('-created_date', 3000)); returnsTotal = rr.filter((r) => leadIds.has(r.lead_id)).length; } catch { returnsTotal = 0; }
        scopeNote = `You are answering for supplier "${supplier.name}". Only this supplier's own lead volume and quality are available. Buyer identities, revenue, internal cost, and other suppliers' data are NOT available and must never be inferred or disclosed.`;
        payload = {
          account_type: 'supplier',
          supplier_name: supplier.name,
          vertical: supplier.vertical || null,
          leads_total: leads.length,
          leads_by_status: statusMap(leads),
          returns_total: returnsTotal,
          recent_leads: leads.slice(0, 25).map((l) => ({ status: l.final_status, response_reason: l.response_reason || '', created: l.created_date })),
        };
      }
    } else if (scope.kind === 'buyer') {
      // Portal scoping is a protected surface. This branch is unchanged.
      const buyer = scope.id ? await svc.entities.Buyer.get(scope.id).catch(() => null) : null;
      if (!buyer) { scope = { kind: 'none', id: null }; }
      else {
        const [leadsRaw, feedbackRaw, returnsRaw] = await Promise.all([
          svc.entities.Lead.filter({ buyer_id: buyer.id }, '-created_date', 2000).catch(() => []),
          svc.entities.BuyerFeedback.filter({ buyer_id: buyer.id }, '-created_date', 2000).catch(() => []),
          svc.entities.ReturnRequest.filter({ buyer_id: buyer.id }, '-created_date', 2000).catch(() => []),
        ]);
        const leads = arr(leadsRaw); const feedback = arr(feedbackRaw); const returns = arr(returnsRaw);
        scopeNote = `You are answering for buyer "${buyer.company_name || buyer.name || 'this buyer'}". Only this buyer's own received leads, feedback, and returns are available. Other buyers' and any supplier's data are NOT available and must never be inferred or disclosed.`;
        payload = {
          account_type: 'buyer',
          buyer_name: buyer.company_name || buyer.name || null,
          leads_received: leads.length,
          leads_by_status: statusMap(leads),
          feedback_total: feedback.length,
          returns_total: returns.length,
          recent_leads: leads.slice(0, 25).map((l) => ({ status: l.final_status, created: l.created_date })),
        };
      }
    }

    if (scope.kind === 'none') {
      scopeNote = 'No account is linked to this user, so there is no account data to show. Do not invent data; answer only general questions.';
      payload = {};
    }

    const convo = history.map((m) => `${m.role === 'user' ? 'User' : (mode === 'build' ? 'BuildBot' : 'DataBot')}: ${m.content}`).join('\n');

    const memoryContext = memories.length
      ? memories.map(m => `- [${m.category}] ${m.fact}`).join('\n')
      : '(none yet)';

    const pastConvContext = pastConversations.length
      ? pastConversations.map(c => `Conversation "${c.title}":\n${c.recent.join('\n')}`).join('\n\n')
      : '(none)';

    // Load bot config for model, temperature, instructions
    const botKey = mode === 'build' ? 'build' : 'data';
    let botConfig: any = {};
    try {
      const configs = arr(await svc.entities.BotConfig.filter({ bot_key: botKey }).catch(() => []));
      if (configs.length) botConfig = configs[0];
    } catch { /* config is optional */ }
    const botModel = botConfig.model || 'gpt-4o-mini';
    const botTemp = botConfig.temperature ?? 0.4;
    const botInstructions = botConfig.instructions || '';
    const botName = botConfig.name || (mode === 'build' ? 'BuildBot' : 'DataBot');

    const prompt = `You are ${botName}, an analytics assistant embedded in the Legenex lead-management platform.

The RESULT block below was produced by running the user's question through a query engine. The counting is already done and it is authoritative. Your job is to read the relevant number out of it and say it plainly, then add one short line of insight if there is an obvious one. Never recount, never estimate, never invent a figure that is not in the block.
${scopeNote ? `\nSCOPE (strict): ${scopeNote}\n` : ''}${planNote ? `\n${planNote}\n` : ''}
HOW TO READ THE RESULT:
- If "entities" is present, the user named a specific supplier or buyer and it was resolved for you. Answer from here first.
- Each entity carries a "requested_period" block. That is the exact window the user asked about, already computed, with "resolved_to" naming which window it was. If requested_period is present it IS the answer to the period they asked about. Never say the data does not specify a period when requested_period is populated.
- Each entity also carries today, yesterday, this_week, last_week, last_7_days, last_30_days, this_month, last_month and all_time, so a follow-up about a different window needs no new query. "How many sold for X yesterday" is entities[0].yesterday.sold.
- this_week is the calendar week, Sunday through today. last_7_days is a rolling seven day window. They are different numbers and both are correct for their own question. If the user's wording is ambiguous, give the one in requested_period and note the other in a short clause rather than refusing.
- "period_bounds" gives the earliest and latest day actually inside the requested window. NEVER name a date outside those bounds. If a date you are about to cite falls outside period_bounds, it belongs to a different window and citing it as part of this one is an error.
- "cost_basis" is a hard constraint, not a footnote. Whenever you report margin_pct, profit, lead_cost or cpl for LeadFlow, Legenex, or for any total that includes them, you MUST state that the figure excludes ad spend and therefore overstates profitability. If asked whether such a margin is real, the answer is no: say it is not a true margin because the cost base is missing, and point at Finances for the settled number. Do not defend the figure.
- "data_quality" when present answers attribution and completeness questions directly. Zero means the field is fully populated, which is a real answer.
- "leads_with_no_event_date" counts rows that could not be dated at all and therefore appear in all_time but in no dated window. If all_time is much larger than the sum of the dated windows, that is why, along with imported leads whose true event dates predate the current windows.
- "totals_for_period" covers the window the user asked about, across everything.
- "groups" is the breakdown, present whenever the question sliced by a dimension. The keys ARE the dimension values. If groups is present, the breakdown exists and you must answer from it. Do not say a breakdown is unavailable when groups is populated.
- "group_by" names the dimension. "group_keys_present" lists every key that exists, including any beyond the ones detailed in groups, so you can state what is there rather than guessing.
- Entity type follows group_by and is not negotiable. Under group_by=buyer the keys are buyers. Under group_by=supplier they are suppliers. LeadFlow, Legenex, Inbounds and TriggerFish are SUPPLIERS. Never describe a supplier as a buyer or the reverse.
- For a superlative question (best, worst, highest, lowest, most, least) rank the entries in groups yourself on the metric asked about and name the winner with its figure. Do not fall back to a period total.
- "overall" holds the standard windows as a fallback if the question drifts to another period.
- Every figure block carries total, sold, unsold, disqualified, returned, rejected, duplicate, revenue, lead_cost, profit, margin_pct, cpl (cost per SOLD lead), rev_per_sold and conv_rate_pct.
- "unresolved_refs" means the name did not match anything known. Say so and offer the closest names from "directory". Do not guess.
- A figure of zero is a real answer. Report it as zero rather than saying the data is unavailable.

Only say something is unavailable when the RESULT block genuinely does not contain it, and when you do, name what periods and dimensions you do have.

BEING USEFUL: you are expected to know this business better than the person asking. When a question has an obvious follow-on, answer it in one short line: if a supplier's conv_rate_pct is well below the others, say so; if margin_pct is negative, lead with that. When asked how to improve profit, reason from the actual numbers present (worst cpl against rev_per_sold, which state or source converts worst, where returns concentrate) and name the specific supplier, buyer or state rather than giving generic advice.
When asked where a money figure comes from, trace it through the finance block and name the date, supplier and account; a number that does not match a total may match a single day. If the ad spend date_range shows the latest date is well before today, say the spend looks stale and give that date.

=== LEARNED MEMORIES (facts from past conversations) ===
${memoryContext}

Every figure you state must come from the RESULT block in this message. Past topics below are there so you know what has been discussed, not so you can reuse numbers from them. A figure quoted in an earlier answer was computed for a different question and is not valid here.

=== PAST TOPICS (questions previously asked, for continuity only, never a source of figures) ===
${pastConvContext}
${images.length ? `\nThe user has attached ${images.length} screenshot${images.length > 1 ? 's' : ''}. Read ${images.length > 1 ? 'them' : 'it'} and answer in relation to what is shown. If a figure in the screenshot disagrees with the RESULT block, say so plainly and treat the RESULT block as authoritative for data, while the screenshot is authoritative for what the interface currently looks like.\n` : ''}
=== RESULT (JSON, authoritative) ===
${JSON.stringify(payload)}

=== KNOWLEDGE BASE ===
${kbContext || '(none available for this account)'}

=== CONVERSATION SO FAR ===
${convo || '(none)'}

User: ${question}
${botName}:`;

    // Vision needs a multimodal model. If the configured one is not obviously
    // capable, fall back for this call rather than dropping the screenshot.
    const visionOk = /4o|4\.1|omni/i.test(String(botModel));
    const modelForCall = images.length && !visionOk ? 'gpt-4o-mini' : botModel;
    const answer = await callOpenAI({
      prompt,
      model: modelForCall,
      temperature: botTemp,
      system: botInstructions || undefined,
      images,
    });

    const answerStr = typeof answer === 'string' ? answer : JSON.stringify(answer);

    // --- Persist the conversation and extract memories (best-effort) ---
    try {
      const now = new Date().toISOString();
      let conv = null;
      if (conversationId) {
        conv = await svc.entities.ChatConversation.get(conversationId).catch(() => null);
      }
      if (!conv) {
        const recent = arr(await svc.entities.ChatConversation.filter(
          { user_id: user.id, mode, active: true },
          '-last_message_at', 1
        ).catch(() => []));
        if (recent.length) conv = recent[0];
      }
      const allHistory = [...history, { role: 'assistant', content: answerStr, timestamp: now }];
      if (conv) {
        let existingMsgs = [];
        try { existingMsgs = JSON.parse(conv.messages || '[]'); } catch { /* malformed history is not fatal */ }
        const updatedMsgs = history.length
          ? [...existingMsgs.slice(0, -history.length), ...allHistory]
          : [...existingMsgs, ...allHistory];
        await svc.entities.ChatConversation.update(conv.id, {
          messages: JSON.stringify(updatedMsgs.slice(-50)),
          message_count: (conv.message_count || 0) + 2,
          last_message_at: now,
          title: conv.title || question.slice(0, 80),
        });
        conversationId = conv.id;
      } else {
        const created = await svc.entities.ChatConversation.create({
          user_id: user.id,
          mode,
          title: question.slice(0, 80),
          messages: JSON.stringify(allHistory.slice(-50)),
          message_count: allHistory.length,
          last_message_at: now,
        });
        conversationId = created.id;
      }

      const newMemories = await extractMemories(question, answerStr, memories);
      for (const mem of newMemories) {
        await svc.entities.ChatMemory.create({
          user_id: user.id,
          fact: mem.fact,
          category: mem.category || 'other',
          source_conversation_id: conversationId,
          confidence: 3,
        }).catch(() => {});
      }
    } catch { /* conversation persistence is best-effort */ }

    return Response.json({ type: 'answer', answer: answerStr, conversation_id: conversationId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
