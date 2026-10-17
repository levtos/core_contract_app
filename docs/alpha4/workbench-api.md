# Alpha 4 — manual-first authoring and diagnostics

This is an additive protocol-1 implementation for review, not a released Alpha 4.
The [architecture contract](../adr/0003-declarative-platform.md) defines the
compatibility and safety boundaries. The [complete example](example-registry.json)
contains no individual Python producer.

## Authoring workflow

1. Read `GET /api/v1/capabilities` and `GET /api/v1/registry/schema`.
2. Start with the active export or an empty object. Create a draft with
   `POST /api/v1/registry/drafts`: either the existing raw configuration body,
   or `{"display_name":"Example","config":{...}}`.
3. Edit all sources, bindings, catalogs, definitions, contracts and parameters
   with `PUT /api/v1/registry/drafts/{id}`, sending `config`,
   `draft_version` and optionally `display_name`. Partial documents may be saved.
4. Validate without saving through `POST /api/v1/registry/validate`, passing the
   configuration document. The draft's `/validate` route uses the same validator.
5. Review the static diff and affected contracts. Successful validation includes
   instantiated machine definitions for code-registered and declarative types.
   This constructs definitions only; drafts never execute producers or guards.
6. Explicitly activate with `draft_version` and `expected_active_revision`.
   Conflicts return HTTP 409. Invalid configurations return HTTP 400.
7. Export, edit and revalidate through the same routes. Rollback uses
   `POST /api/v1/registry/rollback` with `revision` and
   `expected_active_revision`, creating a new revision.

Listing and reading retain their existing routes. Drafts now include
`display_name`, `base_revision`, `created_at`, `updated_at` and
`draft_version`. `DELETE /registry/drafts/{id}` requires a JSON body containing
the current `draft_version`. Duplication requires only create with a copied
configuration; it has no privileged execution path. At most 100 drafts exist.
Explicit draft IDs match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`; omitted IDs are
UUIDv4. Every accepted ID is addressable through the same read/update/delete
routes. Slash, dot-only paths, whitespace, escapes and non-ASCII IDs are rejected.

Null, scalar and array imports are rejected. Without an active registry,
the export route returns HTTP 409 `no_active_registry`. The existing active
revision endpoint retains its nullable response for protocol compatibility.

## Alpha 7: administrative machine restart

[ADR 0004](../adr/0004-manual-machine-restart.md) permits a separate, narrowly
scoped administrative operation. `machine.allow_manual_restart` defaults to
false; absent/false retains historical definition fingerprints. Enabling it is
a semantic change and requires a new immutable definition version.

`GET /api/v1/manual-restarts/preview/{contract_id}` is admin-only and read-only.
It returns permission/reason, initial state, old episode, direct/transitive
contract impact, registry revision and an opaque state token. External automation
impact is explicitly unknown. `POST /api/v1/manual-restarts` is also admin-only;
its closed body requires `command_id`, `contract_id`, a nonempty `reason`, boolean
`confirm`, `issued_at`, `valid_until`, `expected_registry_revision` and
`expected_state_token`. The ordinary `/commands` endpoint does not provide this
administrative operation. No destination state or client identity is accepted.
The authenticated server actor is authoritative. Ingress cross-origin write
protection applies. Disabled/unsupported machines, missing opt-in, stale version
or state, expired requests and missing confirmation cannot apply the effect.

The operation creates an initial-state episode, command result and audit record
in one transaction, then publishes. It shares `command_log` idempotency with
normal commands; `GET /commands/{id}` recovers a lost reply without resubmission.
`state_machine.manual_restart=true` and reason `manual_restart` are exposed to
HTTP/WS consumers and persisted history. Until valid, healthy decisive data
confirms an input transition or the declared recovery condition, the machine
value has degraded quality and is not a healthy available projection. Timer
events, constants, ordinary commands and restore do not confirm the marker.
Restore never repeats the restart. See the [German operation and test notes](../workbench/alpha7/ABLAUF-NEUSTART.md).

## Definition model

Set `fingerprint_version: 2` explicitly when adding declarative definitions.
An omitted value retains Alpha-3 fingerprint version 1. The registry schema
remains version 1; the new field is additive. Validation reports the 1-to-2
context migration before activation. Both modes survive restart; rollback can
select the historical mode as a new revision. No database conversion is performed.
This is forward compatibility for existing Alpha-3 data. An old Alpha-3 binary
does not understand declarative definitions or version-2 fields and must not be
used to run an activated Alpha-4 configuration. Returning to old software needs
an explicitly compatible registry/backup; it is not a silent downgrade path.
Pure v1 writes retain the released stored document shape, verified against
actual Alpha-3 artifacts. See the [downgrade runbook](downgrade.md) before any
binary change; rolling back a registry is not sufficient to downgrade all data.

`definitions[]` contains:

- `type_id` in the synthetic `test.*` namespace, `type_version >= 1`,
  `language_version: 1`, optional editorial name/description.
- `inputs[]`: name and FieldSchema, including required/optional semantics.
- `schema`: independently typed output fields and available_projection.
- `rules`: optional named intermediate expressions.
- `outputs`: an expression for each declared output field.
- `machine`: optional state-machine definition.
- `refresh_inputs`: optional declared HA source inputs using existing staged
  refresh behavior; requests dispatch only after commit.

Instances reference the type/version and bind input names to source IDs or
contract fields. Semantic parameters are part of the definition version;
declarative instance `parameters` is an empty closed object.

Expression examples:

```json
{"op":"and","args":[
  {"op":"input","name":"a"},
  {"op":"not","args":[
    {"op":"literal","schema":{"type":"bool","required":true,"physical_state":false},"value":false}
  ]}
]}
```

```json
{"op":"temporal","id":"stability","operation":"stable_for","duration_s":2,
 "accepts_held":true,"args":[{"op":"ref","name":"grace"}]}
```

The tagged expression schema supplies every parameter and recursive branch.
Operators include input/ref/literal, and/or/not, compare, map, first_match,
bucket, formula, fusion, temporal, machine and not_applicable. First-match
receives evaluated candidates, as the existing resolver does. Named rules are
memoized, so shared stateful rules advance once per producer evaluation.

Bool operations require booleans. Ordered comparisons require compatible
number/text/timestamp operands. Map entries must match their result schema.
Declarative map keys are canonical JSON scalars encoded as object keys:
`{"true":"on","false":"off"}` for boolean input, `{"42":"answer"}` for
numeric input (42 and 42.0 agree), and `{"\"on\"":true}` for text/enum input.
Numbers have no exponent or redundant fraction zeros. String keys are quoted
JSON with exact content, including timestamp strings. Keys are checked against
the input schema/catalog. Legacy binding catalogs and registered maps retain
their existing key format; do not convert them to this declarative format.
First-match results and fusion candidates have compatible types; enum catalogs
can join, and units must agree. Bucket accepts a number and emits a boolean.
Registered formula metadata supplies input/output types; sum preserves a common
unit. stable_for/dwell/edge accept booleans; delta accepts two numbers; age
requires measurement evidence; grace preserves its input type. Unknown and
unresolved are statuses, never substitute boolean values.

Stateful IDs are unique within a definition. Semantic versions cannot be
redefined after activation, including after a rollback or temporary removal.
Change semantics by creating a new version and updating instance references.
Editorial top-level labels can change without invalidating contexts.

Machine states, initial state, transitions, guard expressions, command argument
schemas, episode boundaries, sessions and one deadline are data. Guards can
reference stateless internal rules. Temporal truths enter guards through typed
contract inputs. `argument_equals` adds typed argument checks. A command asks
for a named transition; it cannot write arbitrary runtime state.
There is at most one transition per `(source,event)` pair. Duplicate pairs are
rejected at the offending transition's event path. A machine must be reachable
from an output (including through named rules); unused machines are rejected.
Bucket latches reset to initial on process restart and DB recovery. Other
temporal nodes follow their existing individual restore contracts.

## Validation and static impact

Invalid validation responses contain `valid:false` and `issues[]`:

```json
{"code":"definition.rule_type_mismatch",
 "path":"/definitions/0/rules/condition",
 "object_id":"test.example",
 "message":"rule_type_mismatch"}
```

Paths are JSON Pointers. Structural codes use the stable `schema.*` family;
parameter failures use `parameter.*`; semantic findings include
`input_reference`, `input_type_mismatch`, `contract_cycle`,
`definition.internal_cycle`, `duplicate_identity`,
`immutable_definition_version` and resource-limit codes. Submitted values,
exception contexts and credentials are not echoed. Independent valid objects
are checked even when other objects have structural errors. Unsafe documents
stop before semantic processing.

JSON Schema expresses structural conditions. The returned
`x-semantic-validation` metadata identifies cross-reference, type, graph and
immutability rules requiring the shared validation endpoint. A generic editor
does not need Python class knowledge.
The metadata now lists source/binding/catalog, reference, dependency, graph,
resource and declarative semantic rules, plus model-level conditional
constraints. Use server validation as the authoritative result; structural
Pydantic failures retain the `schema.*`/`parameter.*` code families.

The diff retains added/removed/changed contract lists and adds:

- `objects`: dependencies, sources, bindings, catalogs, contracts and
  definitions, including changed top-level fields.
- `directly_affected_contracts`, `transitively_affected_contracts` and
  `affected_contracts`.
- Source/binding identity consequences, `fingerprint_changes`,
  `possibly_invalidated_contexts`, restore and snapshot implications.
- `affected_fields` lists conservatively affected outputs. `field_paths`
  identifies nested edits with JSON Pointers, capped at 1,024 per object;
  `field_paths_truncated` explicitly identifies larger changes.
- `analysis:"static"` and `predicts_values:false`.

An enabled-state or binding edit can affect consumers even without a changed
definition. Compatible contexts retain original absolute deadlines; changed
fingerprints may require reinitialization. No diff activates or evaluates data.

## Observation and administration routes

All routes below are admin-only except capabilities, types, reasons and info,
which retain the authenticated consumer read boundary.
Capabilities/types intentionally include registered and active declarative
definition metadata and schemas for authenticated consumers, including literal
configuration values. The separate definitions/configuration/history/diagnosis
routes remain admin-only. Registry data must contain no secrets; the metadata
catalog is not a private configuration vault. This preserves the existing
consumer boundary rather than silently changing role behavior.

`capabilities.history.kinds` enumerates every paged history option, including
gaps, diagnostics, revisions and activations. The same object describes the
admin role, page bound, UTC instant ordering and scope-bound cursor. Draft-ID
and declarative map-key conventions are also machine-readable.

| Route | Result |
|---|---|
| GET capabilities | Versioned capability catalog, schemas, conditions, limits and compatibility |
| GET types | Package and active declarative types; parameter/command schemas |
| GET reasons | Version-1 stable reason codes and descriptions |
| GET definitions | Active declarative definitions |
| GET diagnostics/contracts/{id} | Read-only fingerprints, restore case, temporal timing, next due, machine definition/current state and latest trace |
| GET history/query/{kind} | Bounded history page |
| GET evidence/reference/{reference} | Exact recorded observation; explicit 404 if unavailable |
| GET ha/entities | Read-only HA binding-selection metadata |
| GET info | Server UTC time and command time contract, in addition to existing identity/protocol data |

History kinds: contracts, observations, transitions, episodes, deadlines,
commands, gaps, diagnostics, revisions and activations. Query parameters:
`limit` (1–200, default 100), `cursor`, `contract_id`, `source_id`,
`since`, `until` (timezone-aware times, inclusive bounds).
Response: `items`, `next_cursor`, `limit`, `order`.
Continue with the same filters and next_cursor. Sort is descending event time,
then stable row key. Changing a cursor's query scope is rejected. Concurrent
changes do not create a database snapshot; episode/deadline rows can evolve.
Legacy unpaged routes remain compatible.

Evidence references are opaque strings. Fingerprint-version-1 registries retain
the Alpha-3 format (epoch, ingest sequence, binding ID). Version-2 registries use
`v2:epoch:registry_revision:adapter:ingest_seq:binding_id`, preventing collisions
between adapter-local counters and registry changes. The resolver accepts both
formats, including legacy history rows keyed by UUID. New observations, including
unchanged reports and accepted snapshots, retain resolvable references.
Old Alpha-3 observations omitted from its history cannot be reconstructed and
return an explicit 404. Legacy episode/deadline rows without contract_id resolve
their ownership through recorded transitions, without rewriting old records.

Trace retains the latest relevant committed evaluation only. Unchanged
unrelated-source evaluations preserve `at`/`origin`; they are not a processor
heartbeat. It records operator status, named inputs/references, reasons, bounded evidence references, fusion
strategy/candidate selection and guard decisions. Built-in selection reports
candidate indices; registered strategies expose their resulting evidence and
are identified as strategy-defined. Each trace has at most 1,024 records with an
explicit truncation flag. Input/literal/ref/operator steps omit raw values,
including booleans. Only explicit machine guard outcomes and fusion selections
disclose control-flow decisions. Command arguments are omitted. Diagnostics omit temporal
last-value payloads. Reads do not advance state, refresh inputs or fire deadlines.

Discovery uses the existing configured HA authentication and get_states.
Its default response returns entity identifiers, display metadata and attribute names;
attribute/state values are excluded. Alpha 7 adds the explicit admin-only query
`preview=1` for the guided device picker: bounded `current_value` (HA state text,
256 characters), `area_id` and `area_name`. Area assignment uses read-only
`config/area_registry/list`, `config/device_registry/list` and
`config/entity_registry/list`, preferring an entity's area over its device's area.
Unknown/unauthorized registry commands leave area assignment empty; other failures
fail closed. No arbitrary attribute values are exposed. Metadata and preview caches
are separate, both for 15 seconds; the default response cannot inherit preview values.
This is a display projection, never an observation or quality/freshness calculation.
Protocol references: [HA WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)
and [HA entity registry command](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/entity_registry.py).
Response cap: 4 MB and
10,000 entities; page cap: 200. `after` accepts the previous `next_cursor`
entity ID. No HA service call, helper or device mutation is available.
An oversized response is rejected completely with HTTP 503
`ha_discovery_unavailable`; no partial cache or incomplete successful page is
returned. Page size does not reduce the upstream get_states response. Actual
HA size, latency, Ingress trust and client handling require separate Live acceptance.

## Security, time, caching and audit

Administration retains existing bearer roles and the strict Supervisor-peer
Ingress boundary. Client identity headers are ignored. Audit rows in
diagnostic_event record administrative operation, authenticated role/boundary,
revision/object IDs and time. Tokens and arguments are excluded.

Token rotation first commits intent, then changes the token file, then commits
completion. An unmatched intent means the outcome needs reconciliation; it does
not claim completion. Failure of the initial audit commit prevents rotation.
After the token file succeeds, the response remains HTTP 200 with `role`,
`token`, `status:"rotated"`, `rotation_id` and `audit_status:"complete"` or
`"completion_unconfirmed"`. Save the new token even in the latter case; a
completion write or acknowledgement may have failed. Do not retry rotation
automatically. A lost HTTP response remains a network recovery case, not proof
that the old token is valid. Tokens never appear in audit rows or logs.

Command clients use the server time from info/welcome and account for round-trip
uncertainty. issued_at cannot be in the server's future; valid_until is exclusive.
Clock skew does not relax validity, OCC or command replay.

HTTP health and WS service_state report the same readiness reasons. HTML, APIs
and unversioned files use no-store. Fingerprinted assets under assets/ use
one-year immutable caching. Routing and full navigation belong to Phase 1B.
