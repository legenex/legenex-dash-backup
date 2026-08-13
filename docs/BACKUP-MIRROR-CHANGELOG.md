# Backup mirror changelog

- **v3-source-created-date** — Added `source_created_date` to every mirrored
  entity, populated it from the primary's `created_date`, and added the read
  layer that substitutes it back in (`src/api/base44Client.js` on the frontend,
  `mirrorClock.generated.js` on the service-role side). Narrowed the
  append-only set to `MetaSyncRun` alone so every other entity gets full field
  correction on each pass.
- **v2** — Added duplicate detection on `migration_source_id`, declared the
  three fields the primary carries in data but not in schema, and switched the
  bulk update path to a single request per batch.
- **v1** — Initial bulk load and the `mirrorSync` reconcile loop.

## Gotcha worth remembering

Shared modules in this app's backend functions must be plain `.js` imported
relatively (`./mirrorClock.generated.js`), matching the existing
`*.generated.js` convention. A relative `.ts` import makes the functions bundle
fail to build, and a failed build does not surface as an error anywhere — the
platform simply keeps serving the last good version, so edits appear to deploy
and silently do nothing.
