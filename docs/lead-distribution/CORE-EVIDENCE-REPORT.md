# Core Evidence Report - Checkpoint A

> MERGED TO MAIN (2026-07-17). Squash-merged into `main` via PR #2 (merge commit `49f6411`); Phase 1
> security repairs via PR #1 (merge commit `7d3f429`). Base44 synced `main`; all new distribution
> entities are live. PRODUCTION IS LIVE ON legacy_only (AppSettings.distribution_mode unset -> reads
> the schema default legacy_only; all new code is inert). Post-merge read-only verification confirmed
> the four LeadByteConnector records and three Facebook ApiConnector conversion events are unchanged
> (enabled=true, endpoints + updated_date identical to the pre-merge baseline) and CustomCalculation
> still has the vertical field.

Verification date: 2026-07-15. Branch: integration/native-lead-distribution-v2 (rebased on main
717d7bd), merged to main 2026-07-17. Prepared for Nick. This report covers Definition-of-Done Tier 1 items 1 through 16 with an
honest per-item status. PROVEN means a command in this repo demonstrates it now. NEEDS-ENV names the
exact missing environment. PARTIAL means the core logic is proven but a later (ungated or gated)
phase completes the wiring. Nothing is claimed that a command does not show.

## How to reproduce every claim
- `npm test` -> 150 tests pass across 18 files (unit + integration incl. a real local HTTP server).
- `npm run engine:check` -> canonical engine parity + anti-mirror gate passes.
- `npm run lint` -> 53 pre-existing errors, zero new (engine code lives under src/lib, plus no new
  errors in linted paths).

## Tier 1 items

1. One canonical engine implementation exists - PROVEN.
   src/lib/distribution canonical engine; backend consumes a generated, import-free bundle
   (base44/functions/_shared/routingEngine.generated.js). `npm run engine:check` fails on a tampered
   bundle or any reintroduced hand-written routing function (both demonstrated exit 1 in Phase 2).

2. Production, shadow and simulator execute the same engine - PARTIAL.
   PROVEN: the generated backend bundle produces identical decisions to the canonical engine
   (parity.test.js), and the anti-mirror gate forbids a second engine. NEEDS-ENV / later phases:
   the shadow hook inside processLead (Phase 9) and the operator simulator backend function
   (Phase 11) are not wired yet; both will import the same generated bundle. No divergent engine can
   exist because engine:check is blocking.

3. Campaign attribution is deterministic, incl. zero-campaign bootstrap - PARTIAL.
   PROVEN: the zero-campaign / no-matching-config path yields empty groups and a deterministic
   NO_ELIGIBLE_MEMBER rather than evaluating all campaigns (snapshot.test.js). NOT YET BUILT: the
   full attribution hierarchy (key/source -> inbound ref -> source map -> brand+vertical -> default)
   and the documented per-brand/vertical bootstrap campaigns are Phase 3/9 follow-up; the bootstrap
   requires Nick sign-off before any live campaign is created (PB-004).

4. Draft and inactive configurations cannot route - PROVEN.
   snapshot.test.js: a group routes only when active===true AND lifecycle==='active' AND it matches
   the resolved campaign; draft and wrong-campaign groups are excluded (winner null).

5. Buyer lifecycle uses actual Buyer records - PROVEN.
   buildRoutingSnapshot joins the real Buyer; eligibility is ALLOWLIST (status==='active' AND
   active===true). Pinned fixtures: paused+active=true, active+active=false, draft+active=true,
   missing buyer, unknown status all BUYER_LIFECYCLE_INELIGIBLE (engine.test.js, snapshot.test.js).

6. Invalid configuration fails closed - PROVEN.
   snapshot.test.js: invalid filters JSON, unknown condition operator, missing buyer/destination all
   produce CONFIG_INVALID and make the member ineligible; invalid config never broadens routing.

7. Real-schema records map correctly into engine inputs - PROVEN.
   snapshot.test.js uses actual snake_case Base44 field names and asserts correct engine inputs,
   including a 100-member (pagination-scale) mapping.

8. Caps safe under real concurrency (adversarial async, honest CAS) - PROVEN (mock); live NEEDS-ENV.
   capStore.test.js / reservation.test.js: 25 concurrent vs cap 5 => exactly 5; 100 vs 10 => 10;
   windows isolated; counter never negative. The mock models real CAS (read/yield/commit-if-unchanged
   /retry). Live: updateMany CAS on Base44 CapCounter under real parallelism needs a linked Base44 app.

9. Reservations idempotent under concurrency - PROVEN (mock); live NEEDS-ENV.
   reservation.test.js: 10 concurrent calls with one idempotency key => exactly one reservation and
   one cap consumption (atomic claim, not get-then-put). Live claim behavior needs a linked app.

10. Wallet and ledger operations safe under concurrency - PROVEN (mock); live NEEDS-ENV.
    walletLedger.test.js: parallel distinct-key debits lose no updates; duplicate key debits once;
    never negative without a credit limit (5/25 succeed); credit limit holds (10/25, never past
    -limit); repeated return webhook credits once. Live BuyerWallet CAS needs a linked app.

11. Native direct-post works against controlled destinations - PROVEN.
    directPost.test.js runs a real local mock HTTP server inside npm test: accepted (revenue +
    buyer-lead-id extracted), rejected, duplicate, invalid body, form encoding + field mapping,
    timeout-then-accept, 429-then-accept, 500-until-dead-letter, connection failure, ambiguous reset,
    and refusal of a non-localhost host in test mode. Outbound from a deployed Base44 function =
    NEEDS-ENV.

12. Ping-post works against controlled bidders - PARTIAL.
    PROVEN: bid ranking, reserve price, expiry, and tie-break (pingpost.test.js). NOT YET BUILT: the
    full ping-post sequence (concurrent pings, minimal-PII allowlist, winner post, fall-through,
    ambiguous winner) is Phase 8, which is after this checkpoint.

13. Every attempt is persisted - PROVEN.
    directPost.js creates a DeliveryAttempt with status pending BEFORE sending, then completes it with
    a redacted record; directPost.test.js asserts the attempt exists and that request secrets are
    redacted in the stored meta.

14. Retry, lease recovery and dead-letter work - PROVEN.
    retryWorker.test.js: two concurrent workers over an 8-item due queue send each attempt exactly
    once (atomic CAS lease); an expired lease is recovered; dead-letter at the attempt cap; transient
    error reschedules with backoff+jitter; circuit breaker opens after threshold. Live scheduling
    (cron/queue) = NEEDS-ENV (PB-011).

15. Internal financial effects occur exactly once - PROVEN (logic); end-to-end wiring NEEDS-ENV.
    Reservation finalize consumes capacity once; wallet debit is idempotent and applies exactly once
    per idempotency key (reservation.test.js, walletLedger.test.js). The processLead wiring that
    triggers debit only on an accepted primary delivery is Phase 9 (NEEDS-ENV).

16. External delivery uses stable idempotency semantics - PROVEN.
    directPost.js sends a stable Idempotency-Key header (derived from lead + destination) on every
    outbound request; retries reuse the same key (retryWorker reuses the attempt). Effectively-once at
    the buyer depends on the buyer honoring idempotency/dedup; where they do not, detection is via the
    duplicate classification (409 / duplicate mapping) and reconciliation.

## Measured results
- Test suite: 150 passing / 18 files. Concurrency assertions are exact counts (25->5, 100->10,
  10->1, 5/25, 10/25, 8->8 single-send), not sampled.
- No live outbound, no real buyer, no payment, no enabled-state change, no merge to main. Production
  remains legacy_only (the flag field is additive and unused here).

## Residual risks
- CAP-2: whether a Base44 Deno function can relative-import the generated bundle is unverified; the
  bundle is self-contained so inlining is the fallback. Resolved when a staging app exists.
- CAP-3 / PB-008/010: live updateMany CAS semantics under real Base44 parallelism are unverified. The
  honest mock models correct CAS; if live behavior differs, that is the stop-and-present point. No
  external datastore was introduced (would need Nick + Morne approval).
- Items 2, 3, 12, 15 have PARTIAL wiring completed in Phases 8-11 (some gated); the engine, snapshot,
  caps, wallet, delivery, and retry cores are proven now.

## Recommendation
Tier 1 core mechanisms are PROVEN locally; production wiring and live concurrency are NEEDS-ENV.
Status: Tier 1 substantially complete at the logic level, ready for staging verification pending Nick
providing a linked/staging Base44 app. Not ready for production shadow until the processLead wiring
(Phase 9) and staging verification (Phase 18) are done. This is Checkpoint A; the gated phases (8,
12, 14, 15) and any live activation await your review and approval.

---

# Checkpoint B Readiness (Tier 1 items 1-25)

Verification date: 2026-07-15. After Phases 8, 9, 10, 11, 13. Branch
integration/native-lead-distribution-v2. Reproduce: npm test (181 pass / 22 files),
npm run engine:check (green), npm run lint (53 baseline, zero new). Status keys:
PROVEN (command shows it now), PARTIAL (core proven, later/gated phase completes
wiring), NEEDS-ENV (needs a linked/staging Base44 app or sandbox creds).

1  One canonical engine - PROVEN (engine:check + parity.test.js).
2  Production/shadow/simulator run the same engine - PROVEN wiring: shadow
   (shadowHook via processLead) and simulator (simulateReport) both call the
   generated bundle; anti-mirror gate forbids a second engine. Live bundle deploy
   to the function runtime = NEEDS-ENV (CAP-2).
3  Campaign attribution deterministic incl. zero-campaign - PARTIAL. Zero-campaign
   fail-closed PROVEN; the full attribution hierarchy + bootstrap (PB-004) is not
   built and needs Nick sign-off before any live campaign.
4  Draft/inactive cannot route - PROVEN (snapshot.test.js).
5  Buyer lifecycle from actual records (allowlist) - PROVEN (engine/snapshot tests).
6  Invalid config fails closed - PROVEN (snapshot.test.js).
7  Real-schema mapping - PROVEN (snapshot.test.js, incl. 100-member scale).
8  Caps safe under concurrency - PROVEN vs honest CAS mock; live = NEEDS-ENV.
9  Reservations idempotent under concurrency - PROVEN vs mock; live = NEEDS-ENV.
10 Wallet safe under concurrency - PROVEN vs mock; live = NEEDS-ENV.
11 Native direct-post works - PROVEN (directPost.test.js, local server).
12 Ping-post works - PROVEN (pingpostFlow.test.js, 3 local bidders, PII allowlist).
13 Every attempt persisted - PROVEN (directPost persists before send).
14 Retry, lease recovery, dead-letter - PROVEN (retryWorker.test.js).
15 Internal financial effects exactly once - PROVEN (logic: reservation + wallet
   idempotent). The processLead wiring that debits only on accepted primary
   delivery is Phase 15 (gated) = NEEDS-ENV/gated.
16 External delivery stable idempotency - PROVEN (Idempotency-Key on every send).
17 Shadow traces contain complete candidate decisions - PROVEN (shadowHook.test.js).
18 Shadow comparison detects buyer/price mismatch - PROVEN (shadowCompare.test.js,
   full taxonomy).
19 Simulator loads actual published config - PROVEN (simulateReport.test.js; zero
   writes); UI defaults to real-config mode.
20 Portal projections enforced server-side - PROVEN (portalProjection.test.js
   matrix; applied inside supplierPortalData + portalData).
21 Supplier portal hides full key / revenue / cost - PROVEN (Phase 13; PB-015 closed).
22 Config CRUD authorized server-side - PROVEN. distributionConfig and
   distributionSetMode gate every action with operatorAuth.isOperator before any
   service-role access (operatorAuth.test.js: portal/unauthenticated/no-permission
   fail closed). Route Group/Member create/update/validate/publish/pause/archive/
   rollback are operator-only backend functions, not raw browser writes.
23 Published configs immutable/versioned - PROVEN. Publish creates an immutable
   RouteConfigVersion (config hash + snapshot + published_by/at + reason); archive
   only, no hard delete; a historical RouteDecisionTrace.config_version resolves to
   its exact version via resolveTraceVersion (configPublish.test.js).
24 Reporting server-side not client-capped - PARTIAL. distributionShadowReport is
   server-side; general operator reporting (PB-024) is Phase 15 (gated).
25 All operating modes tested - PROVEN. modeControl.js gives every mode real,
   tested behavior against the local mock destination (modeControl.test.js):
   legacy_only runs nothing native; shadow traces only; canary routes only
   explicit-allowlist leads and leaves the rest on legacy, no double-send;
   new_primary_with_legacy_fallback falls back only on an approved clean failure,
   never on accepted/ambiguous (no double-send); new_only never runs legacy. Mode
   changes are audited via distributionSetMode. Live activation of any non-legacy
   mode remains an approval gate (Phase 19).

## Measured results
- 181 tests / 22 files pass. Concurrency and PII assertions are exact (25->5,
  10->1, 8->8 single-send, 3 bidders winner-only PII, no double-send).
- No live outbound, no real buyer, no payment, no enabled-state change, no merge
  to main. Production remains legacy_only; the shadow hook is inert there.

## Recommendation
Tier 1 items 1, 2, 4-14, 16-21 are PROVEN locally. Items 3, 23, 24, 25 are PARTIAL
and item 22 is NOT YET, all completed by the gated phases (12, 15, 16) or PB-004,
which require Checkpoint B approval. Live concurrency, bundle deployment, and
outbound delivery are NEEDS-ENV pending a staging Base44 app. Status: ready for
Checkpoint B review. Not ready for production shadow until the shadow hook is
verified on staging (Phase 18) and Nick approves. Phases 12, 14, 15 and any live
activation await explicit Checkpoint B approval.
