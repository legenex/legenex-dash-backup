# Backup mirror

This app is a data mirror of the primary Legenex dashboard app
(`6a4957e7b03e9b10c170d29e`). It is not a second production system.

## How data gets here

Two secret-guarded backend functions move records between the apps:

- Primary app: `migrateSource` — read only. Serves `count`, `ids`, `read` and
  `filter` pages. It never writes.
- This app: `mirrorSync` — pulls from the primary, then creates what is
  missing, rewrites what changed and deletes what no longer exists upstream.
  `migrateSink` is the lower level writer used during the initial bulk load.

`mirrorSync` runs per entity and records the outcome in `MirrorSyncState`, one
row per entity plus a `__cursor__` row holding the round-robin position.

## The two mirror-only columns

Base44 assigns its own record id and its own `created_date` on insert, and
rejects both if you supply them. A copied record therefore cannot keep either.
Every mirrored entity carries two extra optional fields to work around that:

| Field | Holds |
| --- | --- |
| `migration_source_id` | The record's id in the primary app |
| `source_created_date` | The record's real `created_date` in the primary app |

`migration_source_id` is the join key the sync uses to decide whether a source
record is missing here, has changed, or was deleted upstream. It is also what
lets foreign keys be repointed: a mirrored `buyer_id` holds this app's Buyer id,
not the primary's.

## Time correction

Without correction every mirrored row looks like it was created the moment the
sync ran, so This Month would show the entire history. Two layers fix that:

- `src/api/base44Client.js` wraps the frontend entity client. On the way in it
  rewrites `created_date` in filters and sorts to `source_created_date`; on the
  way out it substitutes the real timestamp back into `created_date`.
- `base44/functions/_shared/mirrorClock.ts` does the same for service-role
  reads inside backend functions. It is copied into each read-only function
  that reports on entity data: `operationsData`, `operatorData`, `portalData`,
  `supplierPortalData`, `generateBillingRun`, `dataBot`, `metaSyncHistory`,
  `progressReadiness`, `listUsers`, `contract`.

Everything above those layers sees the same dates the primary app shows. Rows
created natively in this app have no `source_created_date` and pass through
untouched.

Do not wrap the lead ingestion pipeline with `mirrorClock`. It is a read-side
correction only.

## Exception

`MetaSyncRun` (about 90,000 rows) syncs on id presence alone rather than
diffing every field, so it is not field-corrected on each pass. Its own
`started_at` and `finished_at` columns already carry real times, which is what
`metaSyncHistory` reads.

## Keeping it in step

The `User` entity cannot be mirrored: Base44 owns it and the API refuses record
creation on it. Everything else is covered.

This app should not run its own ingestion. Disable the Meta connector and any
scheduled jobs here, otherwise it generates records the sync then deletes as
orphans on the next pass.
