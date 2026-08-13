# Decisions and Platform Findings (v2)

Verification date: 2026-07-15. Branch: integration/native-lead-distribution-v2 (from main @ 7ac2a41).

## D-V2-001 Base44 sync behavior - RESOLVED with evidence
Base44 syncs the `main` branch (main gained 15 Base44-generated commits while the v1 feature branch
did not). The live app has none of the v1 entities and main has none of the v1 code. Feature-branch
pushes do NOT deploy to the live app. Therefore: develop on integration/native-lead-distribution-v2,
keep production on legacy_only, and any path to production is main via reviewed PR (approval-gated).

## D-V2-002 Canonical engine sharing mechanism - DECISION (pending CAP-2 verification)
Base44 Deno functions historically use only single-file entry.ts with npm:/URL imports; no function
imports a sibling/shared module, so relative-import support is UNVERIFIED (CAP-2). To satisfy PB-001
without depending on unverified runtime imports, the plan is:
- Canonical engine source stays in one place (src/lib/distribution/engine core).
- The backend uses a GENERATED copy embedded into the processLead function via a build/generate step,
  with a BLOCKING CI hash-parity check so the backend copy can never silently diverge (explicitly the
  allowed option 3, not a hand-maintained mirror).
- If, when a staging/linked env exists, Deno relative-import IS supported, switch to a true shared
  import and drop the generated copy. Either way there is exactly one authored engine.
The hand-written shadowEvaluateRouting mirror is deleted.

## D-V2-003 Concurrency primitive - DECISION
Caps, reservations, and wallet balance use the proven updateMany compare-and-swap pattern (CAP-1,
demonstrated by nextLeadId), NOT assumed DB unique indexes (unverified). If adversarial verification
shows CAS is insufficient on Base44, STOP that branch and present options to Nick; do not downgrade
silently and do not add an external datastore without Nick approval + Morne infra sign-off.

## D-V2-004 Branch and push strategy
integration/native-lead-distribution-v2 for platform work; fix/security-portal-keys-operator-gates-ssrf
for the small urgent security PR (Phase 1), both from current main. main is never committed to
directly and never merged without Nick's approval. Note: the environment proxy may restrict pushes to
the previously-designated branch; if non-designated branches cannot be pushed, this is recorded and
the branch is kept local pending resolution (see STATUS).

## Carried-over decisions (still valid)
- D-002 Deliveries/CAPI enabled state: intentional (Nick activated); never changed.
- D-003 Buyer paused+active=true: engine treats fail-closed; no production repair without approval.
- D-007 buyerFeedbackWebhook cross-tenant matching accepted until delivery-time attribution exists;
  v2 native routing sets buyer attribution at route time, which is the proper fix path.
