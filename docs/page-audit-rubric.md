# Page audit rubric

Status: **Implemented** as the readiness model in `src/lib/progress/readiness.js`, with 25 unit tests.

## Lifecycle is a ceiling, not a score

| Lifecycle | Ceiling |
|---|---|
| Not started | 0 |
| Defined | 15 |
| In progress | 40 |
| Implemented, unverified | 70 |
| Verified | 100 |
| Blocked | keeps the achieved score, flagged separately |

A page marked in progress cannot score above 40 no matter how good its dimension scores look.

## Dimensions

| Dimension | Weight |
|---|---|
| Functional completeness | 25% |
| Backend and data integrity | 25% |
| Metric and reporting accuracy | 20% |
| User experience and responsive behaviour | 10% |
| Error handling and resilience | 10% |
| Security and permissions | 5% |
| Performance | 5% |

An unassessed dimension scores zero rather than being excluded from the average. A partly assessed page therefore reads low, which is the honest result.

## Criticality weights

Critical 5, High 3, Normal 1, Low 0.5. A route can carry an explicit `readiness_weight` that overrides this.

Redirects and catchalls are inventoried but carry no readiness weight.

## The hard caps

```
score = min(weighted dimensions, lifecycle ceiling, verification ceiling, open P0 ceiling)
```

- **Verification ceiling 70** until every required check has a passing, non-superseded record. This is what stops "the developer said it is done" from producing a 100.
- **Open P0 ceiling 40** on any surface carrying a confirmed P0. Unconfirmed P0 claims do not cap; they are noted as hypotheses.

## What a page must have to count as verified

`automated_tests`, `production_build`, `functional_acceptance` and `reviewer_approval`, each with a `pass` result that has not been superseded by a later commit.

A result of `needs_env` never counts as a pass. Where two records exist for the same check, the worse result wins, so one failure cannot be buried under a later pass.

## Evidence types

Observed: `code`, `runtime`, `screenshot`, `data`, `test`, `user_feedback`.
Not observed: `inference`, `unknown`.

Only observed types count toward evidence coverage, which drives the confidence rating on the recommendation. A high score built on inference reports as low confidence rather than as ready.
