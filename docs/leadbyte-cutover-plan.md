# LeadByte cutover plan

Status: **Partially implemented**. The mode ladder and its controls exist. Steps 1 through 8 have not been performed.

## Position today

`distribution_mode` is `legacy_only`. All v2 code is inert. Four LeadByteConnectors carry live traffic. Zero Campaigns, RouteGroups, RouteMembers and Deliveries are configured.

Migration readiness 49.9%. All 16 blocking release gates at not started. **The recommendation is not ready.**

## The staged path

Each rung moves only through the audited `distributionSetMode` function, only with Nick's explicit approval, and only one rung at a time. Rollback is the same function back to `legacy_only`.

1. **CAP-2.** An operator opens the Simulator in real-config mode in the live app. This invokes `distributionSimulate` and its dynamic import, proving the generated engine bundle imports in production Deno. Zero side effects, about 60 seconds. This is the last technical unknown before shadow.
2. **Configuration.** MVA and WC campaigns. Per buyer: endpoint tiers, then routing rules. Drag order. Publish. Roughly 18 buyers, done in the app UI.
3. **Close the unassessed capabilities.** Particularly idempotency, consent, duplicate delivery prevention and audit history immutability. Any of these could turn into a P0.
4. **Build the daily reconciliation report.** Without it, step 5 produces no evidence.
5. **Shadow.** Traces only, nothing delivered. Read the comparison report. Requires published config.
6. **Canary.** One test supplier key, with an explicit traffic allowlist.
7. **Perform a rollback during canary**, so the procedure is proven rather than assumed. This closes the `rollback_tested` gate.
8. **Percentage migration, then full cutover.** LeadByte retained for rollback until Nick retires it.

## The gates that must hold first

All 16 blocking gates at `/progress/gates`. The four automatic ones compute themselves from records. The twelve manual ones need an attestation with specific evidence.

The recommendation cannot read ready while any blocking gate fails, whatever the readiness average says. That is enforced in the model, not by convention.

## What is explicitly out of scope for the cutover decision

Decommissioning LeadByte and cancelling the contract. Those happen after a stabilisation period, not as part of going live. `execution.decommission` is marked not required for cutover for exactly this reason.
