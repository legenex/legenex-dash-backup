# Production Blocker Register

> MERGED TO MAIN (2026-07-17). The native lead distribution platform (v2) was squash-merged into
> `main` via PR #2 (merge commit `49f6411`), and the Phase 1 security repairs via PR #1 (merge commit
> `7d3f429`). Base44 has synced `main`: all new entities (Delivery, SubDelivery, RouteGroup,
> RouteMember, CapCounter, CapReservation, DeliveryAttempt, BidAttempt, DestinationHealth,
> RouteDecisionTrace, RouteConfigVersion, DistributionAudit, BuyerWallet) are live, and
> WalletTransaction carries the additive idempotency_key + status. PRODUCTION IS LIVE ON legacy_only:
> `AppSettings.distribution_mode` is unset on the live record and reads as the schema default
> `legacy_only`, so the shadow/native code is inert and the existing LeadByte path stays authoritative.
> Post-merge live verification confirmed all four LeadByteConnector records and the three Facebook
> ApiConnector conversion events are still enabled=true with unchanged endpoints and updated_date, and
> CustomCalculation still has the vertical field. Nothing new activates until an operator moves
> distribution_mode past legacy_only via the audited distributionSetMode function.
>
> UPDATE (2026-07-19): the buyer-centric Lead Distribution IA recomposition (UI only) was squash-merged
> via PR #4 (merge commit `31d6297`); no engine, entity schema, or backend function file changed. The
> IA note below records the details. Production remains on legacy_only.

Primary source of truth for the native lead distribution platform (v2). Verification date:
2026-07-15. Branch: `integration/native-lead-distribution-v2` (from `main` @ `7ac2a41`), merged to
`main` 2026-07-17.

Status values: OPEN, IN-PROGRESS, CLOSED (acceptance proven), INVALID (verified not a problem),
BLOCKED-ON-CREDENTIALS, NEEDS-ENV, AWAITING-APPROVAL. A blocker closes ONLY when its acceptance
criteria are proven with evidence, never because code was written.

## Phase 0 ground-truth findings (evidence)
- GT-1 Live sync: The live Base44 app (6a4957e7b03e9b10c170d29e) has ZERO of the v1 entities
  (RouteGroup..RouteDecisionTrace all absent via list_entity_schemas). `origin/main` does not
  contain the v1 distribution code (engine.js, RouteGroup.jsonc absent; processLead on main has no
  shadowEvaluateRouting or distribution_mode). CONCLUSION: no previous feature-branch code reached
  live. Base44 syncs `main`; feature-branch pushes do not deploy. (Resolves prior D-001.)
- GT-2 Main drift: `main` advanced 24c0557 -> 7ac2a41 with 15 Base44-generated commits implementing
  an unrelated buyer-onboarding feature (new function leadbyteWebhook, entity InboundWebhookRoute,
  OnboardingEmailTemplate, Apply steps, processLead edits). The v1 feature branch is 19 ahead / 15
  behind. v2 starts fresh from main per instruction.
- GT-3 Baseline on main: npm ci PASS; lint 53 errors; typecheck 2355 errors (loose tsc over jsx);
  build FAIL (Base44 app-link/env, environmental); no `test` script. Verified, not assumed.
- GT-4 Live security: main's buyerFeedbackWebhook, testLeadByte, testLeadByteConnector,
  sendPayloadTest still lack the v1 security fixes -> the live app still carries PB-015/H-02/H-03
  class issues. Feeds Phase 1.

## Platform capability findings (Phase 0.3) - some NEEDS-ENV
- CAP-1 updateMany compare-and-swap: PROVEN. processLead `nextLeadId` uses
  updateMany({name, value:expected}, {$set:{value:next}}) and checks result.updated. This is the
  atomic primitive for caps/reservations (PB-008/009).
- CAP-2 Deno shared-module import: UNVERIFIED. No existing base44 function imports a sibling/shared
  module; all are single entry.ts. Determines the PB-001 canonical-engine sharing mechanism.
  Verification requires deploying a function that imports a shared module (NEEDS-ENV) OR using the
  generated-copy-with-hash-parity approach that needs no runtime import. Decision recorded in
  DECISIONS.md; leaning to generated-copy+CI-parity so there is provably one logical engine.
- CAP-3 Unique constraints / indexes / transactions / scheduled functions / cron / durable queues /
  post-response work / secrets storage: UNVERIFIED from here. Base44 exposes create/update entity
  schema and entity CRUD; enforcement of DB-level unique indexes and native transactions is not
  confirmed. Reservation/wallet safety must therefore rest on CAP-1 (CAS), not on assumed unique
  indexes (see PB-009). Scheduling mechanism for the retry worker (PB-011) is NEEDS-ENV.

## Phase progress log
- Phase 2 (PB-001): canonical engine + generated backend bundle + blocking parity/anti-mirror gate.
  Proven (tamper/mirror -> exit 1). CLOSED at mechanism level; consumption wiring later.
- Phase 3 (PB-002/003/005/017): `src/lib/distribution/snapshot.js` `buildRoutingSnapshot` is the ONE
  snake_case -> engine-input mapper. Joins real Buyer (PB-002 fail-closed), gates draft/wrong-campaign
  groups (PB-003), is the sole snapshot builder (PB-005), and fails config closed with CONFIG_INVALID
  (PB-017, invalid never broadens). 15 fixture tests incl. paused+active, missing buyer/dest, draft,
  invalid filters/conditions, expired schedule, cap rollover, low balance, credit limit, circuit open,
  100-member scale, zero-campaign. All pure/unit CLOSED; the backend Deno loader that fetches records
  and calls this mapper is NEEDS-ENV (batched reads, pagination) to run live. 118 tests pass.

- Phase 4 (PB-008/009): capStore.js CAS adapter + honest async mock. Adversarial tests: 25 concurrent
  vs cap 5 => exactly 5; 10 same idempotency key => exactly one reservation; rollback consumes
  nothing; release/finalize once; guarded transitions; counters never negative. reserve() uses an
  atomic claim (fixes PB-009 get-then-put). Command: npm test. Live CAS vs Base44 = NEEDS-ENV.
- Phase 5 (PB-010): walletStore.js versioned-CAS balance + walletLedger.js idempotent debit/credit.
  8 adversarial tests: parallel distinct-key debits lose nothing; duplicate key debits once; not-
  issued changes nothing; ambiguous retry no double-debit; repeated return credits once; never
  negative without credit limit (5/25); credit limit holds (10/25). Command: npm test. Live = NEEDS-ENV.
- Phase 6 (PB-007 delivery + PB-021 redaction): directPost.js adapter (method, json/form, headers,
  field mapping+transforms, timeout, redirect manual, response classification, revenue + buyer-lead-id
  extraction, idempotency key, DeliveryAttempt persisted BEFORE send, redacted request meta). 11
  integration tests vs a real local mock server: accepted/rejected/duplicate/invalid/form/timeout-then-
  accept/429-then-accept/500-until-deadletter/connection-failure/ambiguous-reset/host-not-allowed.
  Command: npm test. Live outbound to a Base44-hosted destination = NEEDS-ENV.
- Phase 7 (PB-011): retryWorker.js atomic CAS lease (two workers never double-send, proven),
  backoff+jitter, dead-letter at cap, lease-expiry recovery, manual retry; destinationHealth.js
  circuit breaker. Command: npm test. Live scheduling mechanism (cron/queue) on Base44 = NEEDS-ENV.

- Phase 8 (PB-012): pingpostFlow.js full sequence. 10 tests vs 3 local mock bidders: PII allowlist
  at ping (bodies verified free of email/phone/address), concurrent pings, BidAttempt persistence,
  reserve/expiry exclusion, deterministic ranking, full PII only to winner, clean fall-through,
  ambiguous-winner reconciliation with no double-send. Command: npm test.
- Phase 9 (PB-006): shadowHook.js runs the full canonical engine (all gates + 5 selection methods)
  through the snapshot loader; wired into processLead as a flag-gated, lazily-imported, guarded hook
  that writes only RouteDecisionTrace, records latency + config identity, skips load when no active
  group (cached), uses bounded paginated reads, and is inert on legacy_only. shadowHook.test.js +
  shadowInert.test.js (static regression: single guard, only RouteDecisionTrace write, no envelope
  mutation). entry.ts parses (esbuild). Live bundle deployment = NEEDS-ENV (CAP-2).
- Phase 10 (PB-020): shadowCompare.js full taxonomy (exact/buyer/destination/price/status mismatch,
  legacy-only, native-only, qualification, configuration-error, evaluation-error), one test per
  category. distributionShadowReport backend fn (operator-only). Command: npm test.
- Phase 11 (PB-013): simulateReport.js runSimulation loads the REAL snapshot via the same loader,
  runs the canonical engine, returns a redacted trace + config identity, ZERO writes/sends (proven).
  distributionSimulate backend fn (operator-only). UI defaults to real-config mode.
- Phase 13 (PB-014/015/021): portalProjection.js authorizePortal + deny-by-default projections +
  sanitizeApiKey, applied inside supplierPortalData and portalData. 12-case authorization matrix.
  PB-015 CLOSED (raw key removed from supplier portal; revenue/cost removed). PB-014 addressed
  (projections enforced server-side inside the actual functions). PB-021 redaction covered for
  delivery attempts (Phase 6) and portal projections.

- Phase 12 (PB-016/018/019): operator-only config lifecycle + immutable versions.
  * PB-016 config authorization server-side: distributionConfig + distributionSetMode gate every
    action with operatorAuth.isOperator BEFORE any service-role access; operatorAuth.test.js proves
    buyer/supplier/linked/unauthenticated/no-permission callers fail closed and admin/permitted
    managers pass. Route Group CRUD is no longer raw browser entity writes.
  * PB-018 no orphan/hard-delete: distributionConfig has no delete; archive only (lifecycle=archived),
    with published history preserved in RouteConfigVersion.
  * PB-019 immutable versions: publish creates a RouteConfigVersion (config hash, snapshot,
    published_by/at, change reason) and stamps the group; the config hash flows snapshot -> engine
    winner -> RouteDecisionTrace.config_version, and resolveTraceVersion resolves a historical trace
    to its exact version (configPublish.test.js). Publish is fail-closed (validateConfigForPublish:
    buyer exists+eligible, destination exists, config parses, caps/pricing/schedule valid).
    UI: typed editors primary + JSON advanced; publish requires a diff confirmation and at least one
    successful simulation (Route Groups UI).
- Phase 16 (PB-022): modeControl.js gives each mode real, tested behavior in the bundled
  orchestration (modeControl.test.js, executeMode vs the local mock destination): legacy_only runs
  nothing native; shadow traces only; canary routes ONLY explicit-allowlist leads and leaves
  non-canary traffic on legacy (proven untouched) and cannot double-send; new_primary_with_legacy_
  fallback falls back only on an approved clean-failure category, never on accepted or ambiguous
  (no double-send proven); new_only never runs legacy. Mode changes go through the audited
  operator-only distributionSetMode (DistributionAudit who/when/from/to/reason), not a raw edit.

## Portal compatibility notes (user-visible field changes)
- supplierPortalData no longer returns: raw ApiKey.key (now prefix + metadata), lead revenue, or
  lead cost. Supplier portal API page must show the prefix and obtain the full key only at issuance/
  rotation (rotation flow is follow-up). Reporting that relied on supplier-visible revenue/cost must
  use operator surfaces instead.
- portalData no longer returns lead cost (internal margin) to buyers; revenue (buyer CPL) is retained.

## NEEDS-ENV summary (what cannot be verified in this environment)
- PB-007 (delivery): logic + local-server integration PROVEN; outbound from a deployed Base44 Deno
  function to a real/controlled destination needs a linked Base44 app.
- PB-010 (wallet CAS): concurrency logic PROVEN vs honest CAS mock; live updateMany CAS on Base44
  BuyerWallet/WalletTransaction under real parallelism needs a linked app.
- PB-011 (retry worker): lease/backoff/dead-letter/circuit-breaker logic PROVEN; a live scheduling
  mechanism (Base44 cron/queue/post-response worker) needs a linked app to run and be verified.
- Escape hatch (PB-008/010): if live CAS proves insufficient, that is the stop-and-present point;
  any external datastore needs Nick approval + Morne infra sign-off. Not taken.

## Blockers

### PB-001 Two routing engines - IN-PROGRESS (mechanism CLOSED; consumption wiring pending)
Current: v2 starts from main, which has NO mirror (the v1 shadowEvaluateRouting never reached main),
so there is nothing to delete. The single-canonical-engine mechanism is now built and proven:
- Canonical engine: src/lib/distribution/ (backend surface: backend-entry.js).
- Generated backend copies: canonical bundle at base44/functions/_shared/routingEngine.generated.js plus per-function copies (the Base44 bundler cannot import across function folders; parity check covers all copies) via
  scripts/generate-backend-engine.mjs (esbuild bundle, no imports, hash header).
- Blocking parity + anti-mirror check: scripts/check-engine-parity.mjs (npm run engine:check), wired
  BLOCKING in .github/workflows/ci.yml. Proven to FAIL on a tampered bundle and on any reintroduced
  hand-written routing function, and PASS when clean.
- Behavioral-equivalence test (parity.test.js) proves generated == canonical decisions.
Evidence: 103 tests pass incl. parity; negative tests exit 1 as required.
Remaining: consumption by shadow/native/retry/simulator functions lands in Phases 6/7/9/11 (each will
import the generated bundle). Runtime import from a Base44 Deno function is NEEDS-ENV (CAP-2); the
generated file is self-contained so inlining is the fallback if relative import is unsupported.
Residual: CAP-2 deployment verification.

### PB-002 Backend buyer lifecycle incorrect - OPEN (VALID, verified)
Current: shadow reads RouteMember.buyer_status which does not exist on RouteMember; real Buyer not
joined. Required: join actual Buyer; ineligible if missing/inactive/paused/terminated/contradictory/
billing-suspended/wallet-fail; fail closed. Affected: loadRoutingSnapshot + engine. Verify: fixture
tests incl. paused+active=true, missing buyer.

### PB-003 Draft groups can route - OPEN (VALID, verified)
Current: RouteGroup defaults active:true while lifecycle draft; shadow filters only by active.
Required: route only when active===true AND lifecycle==='active' AND belongs to resolved campaign
AND references a published config version. Verify: fixture tests for draft/paused/archived exclusion.

### PB-004 Campaign attribution missing - OPEN
Current: no deterministic single-campaign attribution; live Campaign count=0. Required: deterministic
hierarchy (key/source -> inbound ref -> source map -> brand+vertical -> configured default), with a
documented per-brand/vertical default bootstrap presented to Nick before any live creation; ambiguous
-> queue/reject with stable code; never evaluate all campaigns. Verify: attribution unit tests incl.
zero-campaign path.

### PB-005 Three routing data shapes - OPEN
Current: snake_case entities, camelCase engine inputs, partial backend shadow shape. Required: one
`loadRoutingSnapshot` mapper; no other component builds snapshots. Verify: fixture tests vs real
snake_case schemas.

### PB-006 Shadow incomplete - OPEN
Current: shadow omits most gates/methods. Required: full canonical engine with every gate/method
listed in the spec. Verify: shadow trace shows all candidate reasons.

### PB-007 Native delivery absent - OPEN
Current: no backend direct/ping/post delivery; only legacy fire-and-forget JSON logs. Required:
real backend delivery persisting DeliveryAttempt. Verify: integration tests vs local destination.

### PB-008 Cap safety unproven - OPEN
Current: atomicIncrementIfBelow only exists against a synchronous mock. Required: real CAS store
adapter (built on CAP-1); adversarial async tests (25 concurrent vs cap 5 => exactly 5). If Base44
cannot guarantee it, STOP and present (no silent downgrade, no external datastore without approval +
Morne sign-off). Verify: adversarial concurrency tests + real adapter.

### PB-009 Reservation race - OPEN
Current: getReservation then putReservation permits duplicate concurrent reservations; no verified
unique index. Required: atomic claim (CAS), not an assumed unique index. Verify: 10 concurrent same
idempotency key => exactly one reservation.

### PB-010 Wallet not concurrency-safe - OPEN
Current: read-calc-append are separate ops; lost updates possible. Required: append-only ledger +
versioned CAS balance (CAP-1). Verify: parallel debits, duplicate key, credit-limit-under-concurrency.

### PB-011 Attempts/retries only models - OPEN
Required: create-before-send, timeout, classify, complete, schedule, claim, backoff+jitter, max,
dead-letter, manual retry, crash recovery, idempotent replay, circuit breaker. Scheduling = NEEDS-ENV
until mechanism verified. Verify: integration + two-worker no-double-send test.

### PB-012 Ping-post only ranking - OPEN
Required: full sequence (minimal-PII ping allowlist, concurrent pings, timeout, BidAttempt persist,
parse, exclude expired/invalid, winner, full PII to winner only, post attempt, fall-through, ambiguous
handling). Verify: >=3 mock bidders integration test.

### PB-013 Simulator uses fake JSON - OPEN
Current: default simulator uses pasted JSON. Required: default loads actual published snapshot via
loadRoutingSnapshot; zero side effects; what-if JSON becomes advanced mode. Verify: simulator uses
real Buyer/cap/wallet/health/schedule/version.

### PB-014 Portal projection orphaned - OPEN
Current: portalProjection.js is frontend-only, unused by backend. Required: enforce canonical
projections inside the actual portal backend functions. Verify: direct-call authorization tests.

### PB-015 Supplier portal exposure - OPEN (verify first)
Current: supplierPortalData returns the supplier's own plaintext ApiKey.key (verified in v1
inventory). Required: never return full keys/revenue/cost/buyer identity/traces/raw payloads; hash
keys where possible; show prefix/status/dates/last-used/rotation. Verify: direct-call tests. If found
already safe, close INVALID with evidence.

### PB-016 Config authorization not server-side - OPEN
Current: Route Group/Member CRUD via browser entity calls. Required: operator-only backend functions
for create/update/validate/publish/pause/archive/rollback/retire/simulate; authz before service-role.
Verify: direct-call authorization tests.

### PB-017 Config validation fails open - OPEN
Current: malformed JSON/unknown ops become unrestricted filters / passing conditions. Required:
CONFIG_INVALID for bad JSON/operators/missing refs/bad state-zip/schedule/caps/pricing; invalid ->
member ineligible + operator alert; never broaden. Verify: validation unit tests.

### PB-018 Group deletion orphans members - OPEN
Required: no hard-delete of active/historically-used config; draft-only delete, archive/retire,
referential checks, immutable snapshots. Verify: deletion-safety tests.

### PB-019 No immutable config versions - OPEN
Required: draft vs published version, published-by/at, change reason, config hash, immutable snapshot,
rollback, RouteDecisionTrace references exact version. Verify: version + rollback tests; historical
lead explainable via its exact version.

### PB-020 Shadow comparison too crude - OPEN
Current: "both routed" treated as agreement. Required: compare campaign/buyer/destination/status/
price/revenue/reason/fall-through/cap/wallet/result/latency into detailed categories. Verify:
comparison unit tests per category.

### PB-021 Redaction incomplete - OPEN
Current: stores a 500-char response excerpt; PII/secret coverage partial. Required: redact/minimize
headers, URL creds, bodies, email/phone/name/address, TrustedForm URL, Jornaya, keys, tokens, payment,
buyer secrets; structured redacted metadata only. Verify: redaction unit tests.

### PB-022 Modes beyond shadow not implemented - OPEN
Current: canary/new_primary_with_legacy_fallback/new_only are strings with no behavior. Required: real
per-mode behavior with double-send prevention and audited, approval-gated mode changes. Verify:
per-mode behavior tests vs mock destination.

### PB-023 Stripe/Xero abstractions only - BLOCKED-ON-CREDENTIALS
Required: sandbox-complete Stripe + Xero (customer/checkout/top-up/webhook-verify/replay/reconcile;
oauth/tenant/contact/invoice/lines/returns/payment sync/reconcile). Credential-free adapter +
verification-against-fixtures may be built and unit tested; blocker stays open until sandbox runs pass.
Needs sandbox creds from Nick. Also Phase 14 is gated on Checkpoint B.

### PB-024 Reporting capped/client-side - OPEN
Current: client query capped at 2000 leads. Required: server-side/pre-aggregated reporting for the
full metric list with defined tz/semantics. Verify: server aggregation tests + cap-independence.

### PB-025 Native buyer delivery model (Delivery / SubDelivery) - IN-PROGRESS (core PROVEN; secret storage + live-test wiring NEEDS-ENV)
Context: LeadByte modelled a buyer "delivery" as one or more endpoint tiers. The native model adds a
Delivery entity (belongs to exactly one Buyer; status draft/active/paused/archived) and a SubDelivery
entity (one outbound endpoint tier: target_url/method/encoding/headers/field_map/transforms/
response_mapping/timeout/retry). RouteMember.sub_delivery_id is now the CANONICAL destination pointer.
- Fail-closed resolution (PROVEN, snapshot.test.js): a member whose sub-delivery is missing, inactive,
  cross-buyer, or whose parent Delivery is not active is CONFIG_INVALID and never routes. The four
  required fixtures (missing / inactive / cross-buyer / archived-parent) are covered, plus a member
  with neither pointer.
- Per-endpoint retries + circuit breaker (PROVEN): DeliveryAttempt and DestinationHealth carry
  sub_delivery_id; attempts and health key on the endpoint, not the buyer.
- Routing wire-up (PROVEN, routingDelivery.integration.test.js): the snapshot resolves a SubDelivery
  into the directPost cfg and, against the local mock destination, two members on ONE buyer with
  DIFFERENT sub-deliveries deliver to DIFFERENT endpoints with their own prices and caps.
- Credential hard rule (PROVEN, deliveryResolve.test.js + previewClient.test.js): buyer API keys /
  auth headers are NEVER stored in SubDelivery JSON and NEVER reach the browser. Only an opaque
  credential_ref is stored; the real secret is resolved server-side at send time (directPost
  resolveCredential). No credential value appears in any operator/portal projection or persisted
  attempt. NEEDS-ENV: the production resolveCredential -> secret store binding (campaignDeliveryTest
  reads IntegrationConfig as a placeholder) requires deployment secret storage.
- Publish validation (PROVEN, configPublish.test.js): publish fails closed unless every member's
  sub-delivery exists, is active, belongs to that member's buyer, and has a target_url and response
  mapping.
- Live outbound test (STRUCTURAL, NEEDS-ENV): campaignDeliveryTest is OPERATOR-ONLY, refuses unless
  distribution_mode is past legacy_only, requires explicit confirm=true, and writes a DistributionAudit
  record before sending. Dry-run payload preview and response-mapping tester are client-side and send
  nothing (the default). A real send end-to-end depends on secret storage (NEEDS-ENV).
- UI (PARTIAL): Campaigns > Deliveries page (own route /campaigns/deliveries, own permission key
  dist_deliveries, fail-closed) with list-by-buyer, a tab per sub-delivery, dry-run payload preview,
  field-map autocomplete from known lead fields, a response-mapping tester, a route-member backlink
  with an in-use deactivation warning, and the gated live-test dialog. Not yet exercised against a live
  Base44 preview.

Compatibility note (destination_id deprecation): RouteMember.destination_id, DeliveryAttempt.
destination_id, and DestinationHealth.destination_id are marked DEPRECATED in their schema descriptions
and retained additively so existing records keep resolving. sub_delivery_id supersedes them as the
canonical destination. No rename or deletion; legacy destination_id-only members still resolve via the
deprecated path. New members must use sub_delivery_id.

Rename note (safety-critical): the former "Lead Distribution > Deliveries" page (LeadByteConnector /
ApiConnector manager) is titled "Webhooks". Nick performed this rename in Base44 independently and it
is live on main: the page keeps its route /deliveries, the SectionHeader title is "Webhooks", the
coming-soon nav item was removed, and rail icons were added. This branch adapts to that live structure
rather than introducing a new /distribution/webhooks route: /deliveries is gated by its own permission
key (dist_webhooks) and the nav "Webhooks" item points at /deliveries. This is a RENAME ONLY: the live
connector records are unchanged (same SettingsLeadByte manager, same records, no enabled/endpoint/
payload/trigger/filter/mapping change, no migration).

Route Groups (/distribution/routes, key dist_routes) and Simulator (/distribution/simulator, key
dist_simulator) are not primary nav items in the exact structure (Dashboard; Campaigns; Webhooks;
Conversion Events). They remain first-class routes with their own permission keys and are reachable
from the Campaigns > Deliveries page header ("Route Groups" and "Simulator" quick links), so they are
not orphaned. They live off the Deliveries surface because both are routing-config tools: Route Groups
builds the routing that consumes deliveries, and Simulator dry-runs that routing.

## IA change (2026-07-19): buyer-centric Lead Distribution information architecture
UI recomposition only. No engine, entity schema, backend function, or test-logic change (verified:
`git diff --name-only` shows no `base44/functions` or `base44/entities` edits). Summary:
- Nav reduced to exactly five sections: Dashboard, Campaigns, Buyers, Webhooks, Conversion Events
  (each with an icon, shown in the collapsed rail). Verticals, Brands, Suppliers, Deliveries, Route
  Groups, and Simulator are removed FROM THE NAV but keep their routes and permission keys.
  `DistributionNav.test.jsx` pins the new structure (present + absent + collapsed rail).
- New Buyers page at `/distribution/buyers` (key `dist_buyers`) with per-buyer tabs: Routing (existing
  typed RouteMember editor; a new member auto-attaches to the campaign's default RouteGroup, created
  lazily in `draft`), Deliveries (the former standalone CampaignDeliveries content, unchanged, now
  filtered to the buyer via `BuyerDeliveriesPanel`), and a read-only commercial Summary (lifecycle,
  wallet, state-coverage counts) with a Manage-in-Operations link. The old `/campaigns/deliveries`
  route redirects to `/distribution/buyers`.
- Campaigns page is a list + detail. Campaign detail edits the campaign vertical and suppliers-in
  assignment, sets the selection method, and shows ONE ordered member list across buyers with
  native drag-to-reorder priority; each row links to that buyer's Routing tab. On first configure it
  auto-creates the campaign's default RouteGroup (lifecycle draft) via the existing distributionConfig
  function, and Publish reuses the existing flow unchanged (validate, one simulation, diff confirm,
  change reason, immutable version) via RouteGroupPublishDialog. Verticals + Brands live under a Setup
  tab (CRUD preserved). An Advanced link opens the multi-group Route Groups editor (route unchanged,
  out of nav). Simulator is a button on the Dashboard and campaign detail; both pages keep their routes.
- Single source of truth: pricing/lifecycle/coverage edit only in Operations; routing + endpoints edit
  only in the buyer tabs; the Operations buyer detail gains Routing and Deliveries cross-links.

## Notes
- No blocker below is closed. Phase 0 established ground truth only.
- PB-008/010 external-datastore escape hatch requires Nick approval AND Morne infra sign-off; do not
  take it unilaterally.
