# Progress automation

Status: **Partially implemented**. The functions exist and are idempotent. The scheduling is **Configuration required**.

## Backend functions

| Function | Trigger | Writes | Idempotent |
|---|---|---|---|
| `progressSync` | Manual, from Command Center or Progress Settings | `ProgressPage` only | Yes. Re-running with no code change writes nothing |
| `progressReadiness` | Manual, from Command Center or Progress Settings | `ProgressPage` computed fields, automatic `ReleaseGate` status, `ProgressSnapshot` | Yes. Upserts today's snapshot by day key |
| `progressPrompt` | Manual, from a change request | `PromptDraft`, and the change request's RED flags | Creates a new version and supersedes prior drafts |

All three enforce a caller model before any read and none of them touch operational records.

## What `progressSync` protects

Human fields are never included in the update patch: `criticality`, `readiness_weight`, `business_owner`, `technical_owner`, `lifecycle_status`, `blocked_reason`, `dimension_scores`, `migration_required`, `leadbyte_equivalent`, `leadbyte_parity`, `purpose`, `strengths`, `gaps`, `human_notes`, `needs_human_review`, `known_risks`, `last_reviewed_at`.

A route removed from the router is flagged blocked with a reason, not deleted, so its review history survives.

## Stale review detection

Each page carries a dependency fingerprint built from its component path, entity reads, function calls and dependency counts. When the fingerprint moves and the page had previously been reviewed, `review_stale` is set. An unrelated commit does not move the fingerprint, which is what stops every page going stale on every push.

The inverse map, `file_to_pages` in the manifest, resolves a changed file to the pages it can affect. It covers 423 source files today.

## Configuration required

**Nightly recalculation.** A Base44 cron entry calling `progressReadiness` would add a snapshot per day without anyone pressing a button. Morne or Nick must add this from the Base44 dashboard; it is not reachable from the connector. Without it, the trend chart only gains a point when somebody recalculates manually.

## Not implemented

- Entity hooks that recalculate on every finding or change request write. Deliberately left out: recalculation is cheap to trigger and a hook firing on every keystroke-level write would be worse than a button.
- Repository event ingestion. See `github-progress-integration.md`.
- Screenshot capture. See `screenshot-automation.md`.
