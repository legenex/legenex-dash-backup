# GitHub integration

Status: **Not implemented**, by decision. Deferred on 30 July 2026 in favour of the review and readiness surfaces.

This document exists so the gap is recorded rather than discovered later.

## What is missing

Commits, pull requests, linked issues, build status, commit to page mapping and pull request to change request mapping. The Build Activity surface states this on its face rather than showing an empty commits panel.

## Why it is not urgent

The Legenex Base44 app is the source of truth for code. The GitHub repo `legenex/legenex-dashboard` is history and backup only, and nothing deploys from it. A GitHub integration would therefore report on a mirror, not on what is running.

The mechanism that actually matters, linking code movement to affected pages, is already implemented through the dependency fingerprint in `progressSync`. That works off the real code in the Base44 sandbox rather than off commit metadata.

## What it would need

1. A GitHub token stored as a Base44 secret. **Never** expose it to the browser.
2. A `RepositoryEvent` entity for commits, pull requests, issues and deployments.
3. An ingest function, plus either a webhook endpoint or a scheduled poll. A webhook is preferable; a poll is the documented fallback.
4. Mapping changed file paths through `file_to_pages` in the page manifest, which already exists and covers 423 files.
5. Care not to mark every page stale for an unrelated change. The fingerprint approach in `progressSync` is the pattern to follow.

## Interim

Run `node scripts/generate-page-inventory.mjs` after a code change, then Sync inventory. Stale detection works; it is triggered by hand rather than by a push.
