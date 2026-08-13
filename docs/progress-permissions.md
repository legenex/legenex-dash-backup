# Progress Control Center permissions

Status: **Implemented**.

## The five keys

| Key | Grants |
|---|---|
| `progress_access` | Read the Command Center, review tree, findings, change requests, activity, migration and gates |
| `progress_write` | Record page assessments, add comments, update capability assessments, recalculate readiness |
| `progress_review` | Create findings, triage comments into findings, verify fixes, approve or reject |
| `progress_prompts` | Reach Prompt Studio, generate and approve implementation prompts |
| `progress_admin` | Sync the inventory, attest manual release gates, reach Progress Settings |

## Role presets

| Role | Progress keys |
|---|---|
| Owner | All five |
| Admin | All five |
| Manager | `progress_access`, `progress_write`, `progress_review` |
| Supplier | None, enforced in code |
| Buyer | None, enforced in code |

The suggested access levels from the original brief map onto these: Owner and Administrator take all five, Developer takes access plus write, Reviewer takes access plus review, Stakeholder takes access alone.

## Enforcement, in three layers

1. **Route level.** `PATH_KEYS` in `src/lib/permissions.js` maps every progress route to its key. `PermissionRoute` redirects anyone lacking it.
2. **UI level.** `ProgressLayout` filters the sidebar by permission, and each surface hides the actions the current user cannot take. A user with no progress key at all sees an explicit no access notice rather than an empty shell.
3. **Data level.** Every progress entity carries admin-only RLS. Hiding a page in the UI is not treated as protecting its data.

Buyer and supplier accounts are additionally listed in `RESTRICTED_FOR_PARTNERS`, which strips all five keys regardless of what is ticked in Users and Roles. `PermissionRoute` also redirects those roles out of every operator route into their own portal.

## Backend

`progressSync`, `progressReadiness` and `progressPrompt` each enforce a caller model before any read: an authenticated session, not a portal account, not linked to a buyer or supplier, and holding `admin` role or the relevant progress key. Permission checks are never left to the frontend.
