# CLAUDE.md

Guidance for Claude Code when working in this repository (the Legenex Dashboard, a
Base44 app). Base44 deploys the `main` branch; feature branches do not deploy.

## Working Agreement (2026-07-19)

1. **Claude Code is the only code writer.** The Base44 builder is retired for code
   changes, with one narrow exception: Nick may make a small, single-concern,
   UI-only fix through the builder (the hot lane) when no open PR touches that
   area. Any Base44 bot commit ("File changes" or "External agent changes") on
   `main` is treated as Nick's data-driven change, a hot-lane UI fix, or a legacy
   habit: rebase onto it, inherit it, never overwrite it, and flag it in the
   report. If a bot commit conflicts with an open branch, Nick's version on main
   wins and the branch adapts to it.
2. **Every task starts and ends with the ancestor check.** Start each task by
   fetching, rebasing onto `origin/main`, verifying with
   `git merge-base --is-ancestor origin/main HEAD`, and re-running the gates. End
   every push with the same ancestor check. Never report a rebase without it.
3. **Risk tiers govern autonomy.**
   - **GREEN** (UI, docs, tests only; no `base44/functions`, `base44/entities`, or
     `processLead` changes): run fully autonomously to an opened PR.
   - **AMBER** (backend functions, schemas, nav or permissions): same autonomy, but
     the PR body must list every backend and entity file touched.
   - **RED** (`processLead`, live connectors, Conversion Events, `distribution_mode`,
     credentials, billing records, merges to `main`): stop and get Nick's explicit
     approval first.
4. **Merges to `main` happen only with Nick's explicit approval stated in the
   conversation.** Squash only.
5. **Standing protections.** One pipeline through `processLead`; no TrustedForm
   generation; portal scoping enforced server-side; additive schema changes only; no
   em dashes; no secrets in code or logs; production stays `legacy_only` until Nick
   flips it via `distributionSetMode`.
6. **Done means proven by executed commands, never by claims.** Anything
   unverifiable in this environment is labeled NEEDS-ENV, never closed by mocking.
7. **Data and record changes are allowed only when Nick instructs them, under the
   overlap protocol.** Query the targets first and report their IDs and current
   values. STOP and confirm if any target record's `updated_date` is within the
   last 15 minutes. Connector enabled states, Conversion Events,
   `distribution_mode`, credentials, billing records, and buyer pricing are RED and
   need explicit approval regardless of phrasing. Capture before and after values
   for rollback. Use the entity tools for data, never code commits.
8. **Build and maintenance modes.** Multi-phase builds run under `/goal` with
   deterministic done-criteria and a hard stop. Open-PR maintenance runs under
   `/loop`, which never merges and never writes entities.
9. **Design system is enforced.** Every page, panel, list, dialog, and control
   matches `DESIGN-SYSTEM.md` using semantic tokens only, never raw hex or raw
   palette utilities. `design:check` is a blocking gate. Any PR adding or
   restructuring a page names the reference page it mirrors in its body.
