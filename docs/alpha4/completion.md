# Alpha 4 implementation and acceptance evidence

Scope: Issue [#13](https://github.com/levtos/core_contract_app/issues/13),
consolidated PR [#14](https://github.com/levtos/core_contract_app/pull/14).
Baseline: released Alpha 3, commit
`8adb44bf87d77c40bf518e0b8dbf7e1fd0d08ec6`.

This is a technical implementation for independent review. It does not authorize
merge, an Alpha-4 version bump, release, image publication, installation or Live
acceptance. The version remains 1.0.0a3 until separately approved release work.
The exact reviewed head and final CI run belong to the PR/issue evidence, avoiding
a self-referential commit hash in this tracked document.

## Implementation contract and changes

[ADR 0003](../adr/0003-declarative-platform.md) records the concrete decisions.
[Workbench API](workbench-api.md) documents authoring, validation, capabilities,
history, diagnostics, resource limits and compatibility.
[Example registry](example-registry.json) is a validated, data-only cascade.

| Requirement | Alpha-3 starting point | Alpha-4 implementation | Automated evidence |
|---|---|---|---|
| Contract graph and internal rules | Code-defined producers and typed external graph | Closed nested rule union compiled into the existing Producer lifecycle; internal DAG and external topological graph | test_declarative.py; test_alpha4_acceptance.py |
| Dynamic schemas | Package-owned type schemas | Versioned definitions with Bool, Number, Enum, Text, Timestamp, Object, required/optional inputs and fields, catalogs, units, physical_state and available_projection | Typed command/input/output and multifield tests in test_declarative.py; six-field acceptance cascade |
| Generic operators | Existing resolver engines | AND/OR/NOT, comparison, map, first-match, bucket and registered formulas exposed through data | Nested operator, formula, type and bucket tests |
| Fusion | Existing generic engine | Built-in and registered strategies; ordered candidates, conflict and partial evidence retained | Operator tests; cascade unknown/partial/healthy transitions; fusion trace test; existing test_core.py |
| Temporal | Existing temporal helpers | stable_for, dwell, grace, edge, delta, age with stable internal IDs and independently restored contexts | Temporal tests in test_declarative.py; test_restore.py; PostgreSQL cascade |
| State machines | Package factories | Data-defined states, transitions, pure guards, typed commands, episodes, sessions and existing single-deadline semantics | Declarative command/restore/failure tests; machine diagnostics; PostgreSQL restart |
| Capability discovery | Basic types endpoint | Versioned capability/reason catalogs, recursive schemas, conditions, registered formula/fusion metadata and semantic validation rules | Schema/capability tests; new code-registered formula discovery test |
| Manual-first guarantee | Whole registry import/draft API | All supported definitions editable through the same public draft/validation/activation/export APIs; no AI-specific or import-only path | Full HTTP authoring and restart/rollback acceptance test |
| Atomicity and failures | Existing E1–E4 transaction rules | Producer-local staging reused; failed command override rolls back nodes, machine, latches and refresh; replay returns persisted rejection without publication | test_declarative_command_failure_rolls_back_nested_state_and_replays; prior Phase-1A command regressions |
| Compatibility | Alpha-3 registry/protocol/DB | Registry schema 1 and protocol 1 retained; explicit fingerprint_version 2 for declarations, default 1 retains old semantics; no DB migration | Legacy fingerprint test; explicit upgrade/rollback test; PostgreSQL upgrade/restart/rollback; complete prior suite |
| Installation and packaging | Supervisor app and Python client | Existing installation ID, build, transport and image contracts retained | test_bootstrap.py; test_setup*.py; test_scope_packaging.py; CI client wheel and both image architectures |

Implementation files:

- `declarative_models.py`, `declarative.py`, `engines.py`: closed data model,
  typed compilation, existing-engine dispatch, bounded explain and registration.
- `registry.py`, `schema.py`, `validation.py`: additive schemas,
  aggregate validation, revision-local types, semantic diff and fingerprints.
- `runtime.py`, `persistence.py`, `history.py`, `evidence.py`: lifecycle,
  atomic administration, bounded history reads, evidence resolution and audit.
- `api.py`, `capabilities.py`, `adapters/ha.py`, `adapters/mqtt.py`:
  public authoring/diagnostic contracts, discovery, readiness, clock and caching.
- Tests add declarative, Workbench and full acceptance suites plus PostgreSQL,
  packaging and transport regressions. The engineering UI is unchanged.

## Opus A1–A16 disposition

All rows describe the implementation in this PR; they do not claim independent
review or human Live acceptance.

| Finding | Implemented result | Evidence |
|---|---|---|
| A1 validation | Aggregate safe issues with stable codes, JSON Pointer paths and object IDs; unsaved validation; incomplete drafts; independent semantic checks despite structural errors | test_unsaved_validation_aggregates_paths_and_no_mutation; test_validation_collects_structural_and_independent_semantic_errors; test_definition_errors_are_field_addressable |
| A2 diff/impact | Dependencies, sources, bindings, catalogs, contracts, parameters, definitions and nested field paths; direct/transitive consumers, changed fingerprints, identity, restore/snapshot consequences; no value predictions | test_semantic_diff_and_definition_immutability; test_explicit_fingerprint_upgrade_and_dependency_impact; full cascade semantic edit |
| A3 drafts | Create/read/update/list/delete with OCC and metadata; copy through create; null/array/scalar imports rejected; no-active export gives explicit 409 | test_drafts_incomplete_roundtrip_occ_delete_and_audit; test_bad_import_forms; test_no_active_export_time_readiness_and_rotation_audit |
| A4 schema metadata | Recursive JSON Schemas, type/command/parameter data, conditional requirements and cross-reference validation metadata | test_schema_capabilities_and_reason_catalog; test_new_code_registered_formula_discovered_without_editor_special_case |
| A5 machine definitions | Active instance diagnostics and validation results expose states/transitions for registered and declarative machines; declarative guard data remains in definitions | Machine diagnostics test; acceptance API |
| A6 machine history | Paged transitions, episodes, deadlines and commands; legacy episode ownership resolved through transitions | test_machine_and_temporal_diagnostics_read_only; PostgreSQL legacy-row query assertions |
| A7 temporal/restore/explain | Timing-only contexts, start case, expected/stored fingerprints, due time and latest committed explain; no state mutation on read | Read-only diagnostics test; nested temporal restore tests; trace redaction/selection tests |
| A8 observations/evidence | Every accepted observation retained by exact reference, including reports/snapshots; v1 legacy lookup and v2 revision/adapter uniqueness | test_history_cursor_evidence_filters_and_roles; test_versioned_evidence_is_unique_and_legacy_references_remain_resolvable; PostgreSQL evidence resolution |
| A9 paging | 1–200 rows, stable descending time/key order, query-bound cursor and inclusive UTC filters; no history preload | History cursor tests; PostgreSQL bounded history/restart tests |
| A10 audit | Draft operations, activation, rollback and token rotation recorded in diagnostic_event; role/verified boundary only; no spoofed HA-user headers or tokens | Draft audit spoof test; token audit and failed-commit/no-rotation tests; acceptance rollback history |
| A11 subscribed readiness | HTTP health and WS service_state carry the same complete reasons, including post-recovery state | Full cascade subscription test; strengthened real-client recovery transport test |
| A12 HA discovery | Admin-only authenticated get_states, safe selection metadata, bounded response, paging and short cache; no HA writes | test_read_only_ha_discovery_is_role_limited_cached_and_redacted |
| A13 command time | Server UTC in info/welcome and explicit validity contract; strict validity and replay unchanged | Time endpoint test; existing command validity/replay suite; declarative commands |
| A14 caching | Immutable one-year caching only for fingerprinted assets; HTML/API/unversioned responses no-store | test_versioned_static_cache_only |
| A15 diagnostic events | Existing table now carries administrative audit events with bounded read API; no new DB schema | Audit tests; PostgreSQL diagnostic history |
| A16 reasons | Versioned complete reason catalog with stable codes and descriptions | test_schema_capabilities_and_reason_catalog checks every ReasonCode |

## End-to-end evidence, steps 1–18

`test_data_only_cascade_full_manual_first_acceptance` uses only registry data
for the new semantics. Its HTTP authoring helper saves an incomplete draft,
updates it, validates it and explicitly activates it. It reuses the real Python
client and WebSocket transport. The PostgreSQL variant executes the same
semantic cascade against real persistence.

| Steps | Proof |
|---|---|
| 1–2 | Two independent sources/bindings and two typed declarative truth contracts |
| 3–4 | OR fusion followed by AND/NOT and a registered-formula comparison |
| 5–7 | Independently identified Grace/stability nodes and a guarded state machine with six typed output fields |
| 8–10 | Public validation, static diff, incomplete draft update, OCC activation and new revision |
| 11–12 | Source changes propagate through the whole cascade; unknown, degraded partial evidence, healthy and held states asserted |
| 13 | HTTP snapshot, WebSocket initial state and real client agree on committed contracts and publication sequence |
| 14 | Restart retains original Grace expiration and machine deadline; PostgreSQL test also injects failed commit and recovery |
| 15 | New immutable semantic version changes fingerprints and marks temporal/consumer contexts incompatible |
| 16 | Public rollback creates revision 3 from revision 1; historical definitions remain immutable |
| 17 | Public history and diagnosis expose contracts, observations, transitions, episodes, deadlines, commands, audit and explain |
| 18 | Active export is read, validated, edited and reactivated using the same public APIs |

Additional tests cover rejected executable operators, productive type IDs,
cyclic/internal references, wrong types, duplicate stateful IDs, nested/expanded
depth, aggregate evaluation cost, source liveness cycles, binding type
compatibility, immutable version tampering, secret reflection, command failure
and exact evidence compatibility. Existing security and acceptance tests remain.

## Resource, migration and operational boundaries

- No DB schema migration is needed: existing JSONB tables carry additive data.
  Fingerprint migration is explicit registry data, not a silent DB rewrite.
  Version 1 survives restart unchanged; version 2 survives restart; rollback
  chooses the historical algorithm as a new revision.
- Definition semantics are immutable across all committed revisions. New tuning
  uses a new definition version; instance parameters remain an empty object.
- Guards are pure. Temporal guard inputs come from typed contracts. One machine
  and one deadline per contract preserve the engine's supported model.
- Documents are capped at 2 MB/depth 32; definitions at 128; rules at 256/depth 16;
  inputs at 64 and outputs at 32. Evaluation limits are 512 per contract and
  8,192 aggregate; version-2 graph depth is 64. Tests reject over-limit data.
- Explain stores only the latest committed trace, at most 1,024 records with
  truncation metadata and 64 evidence references per record. No raw values,
  arbitrary attributes or command arguments are copied into explain.
- History pages are bounded but durable history retention remains unchanged.
  Old rows may lack data the old runtime never recorded. Keyset pagination is
  not a long-lived database snapshot; episode/deadline rows can evolve.
  Existing database command timeouts bound reads; very large real installations
  still need workload-specific performance acceptance.
- New observation references are versioned opaque strings. Existing references
  remain readable. No interpretation of reference text is required from clients.
- Token files and PostgreSQL cannot share one transaction: durable rotation
  intent precedes the file operation and completion follows it. An unmatched
  intent is explicitly indeterminate.

## Validation and acceptance gates

The existing CI workflow remains authoritative: Ruff/format, strict mypy,
complete Python tests, real PostgreSQL, MQTT integration, resource probe,
dependency/security audits, frontend checks/tests/build, HA bridge kernel,
client/package builds and AMD64/AArch64 Supervisor builds. AMD64 includes
isolated container lifecycle smoke. Image build jobs do not publish.

The initial implementation head passed the complete CI:
[run 38139991908](https://github.com/levtos/core_contract_app/actions/runs/38139991908).
Final-head checks and exact test totals are recorded in
[PR #14 checks](https://github.com/levtos/core_contract_app/pull/14/checks) and
Issue #13. Only the final reviewed head's complete successful run is delivery
evidence; an earlier green run does not cover subsequent edits.

Two prior test assumptions were strengthened, not removed: the packaging test
permits only the generic declarative compiler's ContractType construction and
adds a productive-namespace rejection; the transport test additionally verifies
the complete recovery service_state before requiring the resync snapshot.

G1–G15 and their [Live acceptance contract](../platform-alpha1/live-acceptance.md)
remain unchanged. Proposed G16 is the automated manual-first declarative
platform proof above. It supplements those gates and does not replace them.

Still open by design: independent Opus review, human HA/Supervisor installation
and Live acceptance, real installation discovery/Ingress verification and
Phase-1B frontend/UX decisions. No production domain, AI dependency, actor logic,
Legacy change, HA restart, release or deployment is part of this PR.
