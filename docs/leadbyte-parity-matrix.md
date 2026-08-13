# LeadByte parity matrix

Status: **Implemented and populated**. 71 capabilities seeded 30 July 2026. Live view at `/progress/migration`.

This file describes the matrix. The matrix itself lives in the `MigrationRequirement` entity, because a markdown table would go stale the moment anyone assessed anything.

## Current position

| Figure | Value |
|---|---|
| Capabilities recorded | 71 |
| Required for cutover | 70 |
| Migration readiness | 49.9% |
| Evidence coverage | 74.3% |
| Unassessed | 11 |
| Outright gaps | 5 |

Risk weighted: critical 5, high 3, medium 1, low 0.5.

## The ten groups

A ingestion, B processing, C routing, D delivery, E buyers, F suppliers, G reporting, H reliability, I security, J execution.

## How a capability is scored

Not assessed 0, not started 0, in progress 40, implemented but unverified 70, verified 100, blocked 0 and flagged.

A capability claiming `verified` whose `evidence_type` is `inference` or `unknown` is **automatically downgraded to 70** in the calculation. Claiming something works is not the same as showing it.

## The five gaps

| Capability | Why it is a gap |
|---|---|
| `reporting.daily_reconciliation` | No parallel reconciliation report exists. Running both systems side by side proves nothing without one |
| `reliability.runbook` | Replacing a vendor means absorbing their support burden. No runbook exists |
| `execution.config_import` | Roughly 18 buyers will be configured by hand. That is a transcription risk |
| `execution.historical_leads` | No plan for retaining historical leads after decommissioning |
| `execution.stabilisation_monitoring` | No numeric rollback triggers agreed. Rollback becomes a judgement call under pressure |

## The eleven unassessed, in rough order of exposure

`ingestion.idempotency`, `processing.consent`, `processing.audit_history`, `processing.normalisation`, `routing.duplicate_delivery_prevention`, `security.pii_handling`, `reliability.backup_restore`, `reliability.rate_limits`, `delivery.replay_resubmit`, `suppliers.caps_coverage`, `suppliers.compliance_docs`.

Two of these are worth flagging on their own:

- **`ingestion.idempotency`.** No idempotency key mechanism was located on `processLead`. If a supplier retries a submission, a second lead and a second delivery may be created. If confirmed absent, this is a P0 migration blocker.
- **`processing.consent`.** Consent text and timestamp storage per lead could not be located. Compliance exposure if genuinely absent.

Both are recorded as unassessed rather than as defects, because absence of evidence during a source inspection is not proof of absence.
