# Verification process

Status: **Implemented** for the record model and the calculation. **Partially implemented** for evidence capture: records are created by hand today, not by automation.

## The principle

A page is not verified because a developer says it is complete. It is verified when evidence exists that somebody else can inspect.

## The six lifecycle states

1. Designed (`defined`)
2. Being implemented (`in_progress`)
3. Technically complete (`implemented_unverified`)
4. Independently verified (`verified`)
5. Ready for production traffic (verified plus its release gates passing)
6. Safe to replace LeadByte (all blocking gates passing, no open P0, migration readiness at threshold)

The gap between 3 and 4 is the point of the whole system. It is enforced by a hard cap, not by convention.

## Recording verification

Create a `VerificationRecord` with `subject_type`, `subject_key`, `check`, `result`, `evidence`, `evidence_type`, `verified_by`, `verifier_role` and `app_commit`.

`app_commit` matters: when the subject changes after a verification, that record should be marked `superseded` so the page drops back below the verification ceiling. Today that is a manual step.

## What counts

| Check | What good evidence looks like |
|---|---|
| `automated_tests` | The `npm test` output, naming the files that cover the surface |
| `production_build` | `npm run build` exit code and date |
| `design_token_gate` | `npm run design:check` output |
| `engine_parity_gate` | `npm run engine:check` output |
| `visual_review` | Who opened the page, on what viewport, and what they checked |
| `functional_acceptance` | The acceptance criteria from the change request, each shown to hold |
| `data_reconciliation` | The two numbers compared and the delta |
| `permission_test` | The role used and what was and was not reachable |
| `error_state_test` | The error path triggered and what the user saw |
| `mobile_test` | The viewport and what was checked |
| `reviewer_approval` | Someone other than the implementer, named |

## needs_env

Anything that cannot be verified from the current environment is recorded as `needs_env`, never as a pass and never quietly closed. Live cap behaviour under concurrency, deployed outbound delivery and retry scheduling are all currently in this state.
