# Backup mirror changelog

- **v3-source-created-date** — Added `source_created_date` to every mirrored
  entity, populated it from the primary's `created_date`, and added the read
  layer that substitutes it back in (`src/api/base44Client.js` and
  `base44/functions/_shared/mirrorClock.ts`). Narrowed the append-only set to
  `MetaSyncRun` alone so every other entity gets full field correction.
- **v2** — Added duplicate detection on `migration_source_id`, declared the
  three fields the primary carries in data but not in schema, and switched the
  bulk update path to a single request per batch.
- **v1** — Initial bulk load and the `mirrorSync` reconcile loop.
