# Backup mirror

This app is a data mirror of the primary Legenex dashboard app
(`6a4957e7b03e9b10c170d29e`). It is not a second production system.

## How data gets here

Two secret-guarded backend functions move records between the apps:

- Primary app: `migrateSource` — read only. Serves `count` and `read` pages.
- This app: `migrateSink` — service-role writer. Serves `count`, `read`,
  `write`, `update`, `updatemany` and `purge`.

## migration_source_id

Base44 assigns its own record ids and its own `created_date` on insert, so a
copied record cannot keep the primary's id or creation timestamp. Every mirrored
entity therefore carries an extra optional field, `migration_source_id`, holding
the id the record has in the primary app.

That field is the join key the sync job uses to decide whether a source record
is missing here, has changed, or has been deleted upstream. No dashboard code
reads it.

## Known limitation

`created_date` and `updated_date` in this app reflect when the record was
mirrored, not when it was originally created upstream. Anything that needs the
original timestamp should join back through `migration_source_id`.
