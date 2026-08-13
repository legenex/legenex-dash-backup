# LeadByte rollback plan

Status: **Partially implemented**. The mechanism exists and is audited. It has never been executed, which is why `rollback_tested` is a blocking release gate.

## The mechanism

Call `distributionSetMode` with `legacy_only`. One audited action. The v2 code goes inert and the four LeadByteConnectors continue carrying traffic exactly as they do today.

Never edit `distribution_mode` directly. It is a RED surface and the only supported path is the function, which records who changed it and when.

## Why rollback is cheap here

LeadByte is not switched off at cutover. It is retained until Nick decides to retire it. Rolling back is therefore returning to a system that is still running, not restoring one that was dismantled.

## What has not been proven

Nobody has executed a rollback. A documented procedure that has never been run is an assumption. The plan is to perform one deliberately during canary, while the blast radius is one supplier key, and record it as the evidence that closes the gate.

## Missing, and it matters

**No numeric rollback triggers have been agreed.** Without them, the decision to roll back becomes a judgement call made under pressure by whoever is watching. Before canary, agree the thresholds:

- Delivery failure rate above what, over what window
- Ingestion rejection rate above what
- Any duplicate delivery at all, which should probably be an immediate trigger
- Revenue variance against the LeadByte baseline beyond what percentage
- Any buyer or supplier isolation failure, which should be immediate

This is tracked as `execution.stabilisation_monitoring` in the parity matrix and is currently a gap.

## After a rollback

1. Confirm `distribution_mode` reads `legacy_only` and post one real test lead.
2. Record what triggered it as a finding at the appropriate priority.
3. Do not re-advance a rung until that finding is closed with evidence.
