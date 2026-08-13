# Progress Control Center

Status: **Implemented**. Built 30 July 2026. Verified by the gate suite; not yet verified in a browser.

An internal build-management surface for the Legenex Dashboard. It exists to answer one question honestly: can this platform replace LeadByte yet, and if not, what specifically is in the way.

It is not a project-management page. Every number is computed from records through one canonical model, and the model is designed to be hard to fake.

## Where it lives

| Route | Status |
|---|---|
| `/progress` on `dashboard.legenex.com` | **Implemented**, gated by the progress permission keys |
| `progress.dashboard.legenex.com` | **Configuration required**, see `progress-subdomain-setup.md`. Host detection is already in `src/App.jsx` |

On the progress subdomain the app serves only the Progress Control Center. The operator dashboard is not reachable through it.

## The nine surfaces

| Surface | Route | What it does |
|---|---|---|
| Command Center | `/progress` | Readiness, blockers, evidence, assumptions, the go or no-go call |
| Application Review | `/progress/review` | Every route in a tree, with a per-page review workspace |
| Findings | `/progress/findings` | Machine, AI and human findings in one list, plus comment triage |
| Change Requests | `/progress/changes` | Draft through released, with status requirements enforced |
| Prompt Studio | `/progress/prompts` | Generated implementation briefs, reviewed before handoff |
| Build Activity | `/progress/activity` | One timeline across everything recorded |
| LeadByte Migration | `/progress/migration` | 71 capabilities across ten groups |
| Release Gates | `/progress/gates` | 17 objective conditions, 16 blocking |
| Progress Settings | `/progress/settings` | The model explained, sync controls, what is not configured |

## The workflow it is built around

1. You open a page in Application Review and comment on the exact thing that is wrong: a metric, a status pill, a lead count, a filter, a backend function. Context is captured automatically.
2. The comment is triaged into a finding on the Findings surface. Human findings start as `requires_verification`, because an observation is not yet a proven defect.
3. A finding is raised into a change request, which cannot reach ready for implementation without an explicit do-not-touch list and testable acceptance criteria.
4. Prompt Studio assembles an implementation brief from the change request, its findings, your original words and the real dependency graph.
5. You review, edit and approve the prompt. **Nothing is ever dispatched automatically.** Handing it to an agent is a separate action you take yourself.

## Operating it

**First run.** Open `/progress`, press **Sync inventory**. This registers every route in the router as a review record. Then press **Recalculate readiness**, which writes the first snapshot and starts the trend line.

**After a code change.** Re-run `node scripts/generate-page-inventory.mjs`, then Sync inventory. Pages whose dependency graph moved and which had been reviewed are flagged stale. Unrelated changes do not flag anything.

**Daily.** Recalculate readiness adds a point to the trend. A Base44 cron would automate this: see `progress-automation.md`.

## What it deliberately does not do

- It does not dispatch prompts, change production code, merge pull requests or deploy.
- It does not let a developer mark their own work verified. Verification needs evidence records.
- It does not let a high average override a failing gate or an open P0.
- It does not show a screenshot panel or a commits panel that looks broken. Where something is not configured, it says so.
