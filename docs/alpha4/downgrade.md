# Alpha-3 compatibility and downgrade procedure

This is an operator runbook, not authorization to touch any installation.
Alpha-3 reference: `v1.0.0a3`, commit
`8adb44bf87d77c40bf518e0b8dbf7e1fd0d08ec6`.

## What is compatible

Alpha 3 uses closed Pydantic models. It rejects unknown `fingerprint_version`,
`definitions`, source `value_schema`, and observation `reference_version` fields,
even when they merely contain Alpha-4 defaults. Alpha 4 now omits absent/default
extensions in **durable pure-v1 writes**, including registry activation and
rollback, reports, snapshots and recovery. Explicit extensions remain explicit.
The stored checksum covers exactly that serialized document.

The fixtures in `tests/fixtures/alpha3-*-v1.json` were serialized by the actual
released Alpha-3 models. Exact round-trip/activation/rollback equality guards
the old format. Released fingerprint vectors additionally guard semantics.
No schema migration or installation-ID change is performed.

An installation that has only ever stored compatible v1 content can retain its
registry format. This does **not** assert that an arbitrary database is safe to
open with an older binary: drafts, older revisions, observations, node contexts,
metadata and schema migrations also belong to the compatibility decision.
Pre-review Alpha-4 snapshots may already contain incompatible default fields;
this correction does not silently rewrite that historical data.

## After Alpha-4-only data has been stored

After a declarative/v2 activation, a registry rollback creates another revision;
it does not erase v2 history, definitions or contexts. Returning the active
registry to v1 does not make the complete database Alpha-3-compatible. Use a
known Alpha-3-compatible **backup pair**, even if the currently active content
looks like v1. Do not strip fields manually or overwrite old revision meaning.

1. Obtain separate authorization for the installation operation. Stop the app
   cleanly; preserve the current `/data` and database as a recovery pair.
2. Select a matching pre-upgrade database dump and `/data` backup (installation
   ID, tokens, private setup configuration and app/schema version). A Supervisor
   backup alone does not include external PostgreSQL.
3. Validate restoration in an isolated database using the exact Alpha-3 binary.
   Verify all stored registries, observations and runtime contexts can be read,
   identity matches, expected writer lock/migration checks pass, and command
   replay and restart/restore behave correctly.
4. Restore that pair through the existing [operations procedure](../operations.md).
   Never reuse an incompatible newer live database for the old binary. Preserve
   installation identity; do not initialize a new ID to bypass a mismatch.
5. Consumer epoch/resynchronization and HA/Supervisor Live checks remain human
   acceptance gates. No automated deployment or downgrade is part of PR #14.

Network/HTTP failure after token rotation is separate from registry rollback:
the token file may already have changed. Save a returned `status:rotated` token
even when `audit_status:completion_unconfirmed`; do not retry automatically.
The correlated durable intent does not prove the file outcome. If no response
arrives, recover through the existing trusted administrative boundary; never
put credentials into logs, issue comments or audit metadata.
