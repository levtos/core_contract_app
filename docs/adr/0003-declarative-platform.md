# ADR 0003 — Alpha 4 declarative platform and Workbench API

Status: implementation proposal for independent review. This does not grant
release, installation, or Live acceptance. Issue: Levtos/core_contract_app#13.

## Contract

Registry schema version 1 gains an optional `definitions` collection and sources
gain an optional `value_schema`. Existing documents remain valid. Definitions
have a `test.*` type identity, immutable semantic version, typed inputs, the
existing multi-field output Schema, named internal rules, output expressions,
and optionally one state machine. Contract instances retain their existing
type/version, enabled flag and input bindings. Declarative instance parameters
are empty: rule parameters belong to the immutable definition version.

Declarative registries explicitly select `fingerprint_version: 2`. The omitted
default is 1, preserving Alpha-3 fingerprints on load, restart and ordinary
legacy edits. Version 2 includes complete dependency and transitive liveness
semantics. The explicit 1-to-2 change invalidates affected contexts and is
reported as a context migration by validation/diff. A rollback to an old
revision restores its original fingerprint algorithm as a new revision.

Definitions compile into revision-local ContractTypes with the existing
Producer lifecycle. A draft does not register global types or run producers.
Activation validates the entire candidate and the historical immutability of
each definition version before staging a new revision. Package-owned types
cannot be overridden. Rollback creates a new revision using historical data.

No new runtime, plugin loader, interpreter for expression strings, or executable
registry content is introduced. The finite tagged rule union dispatches only
to existing resolver, fusion, temporal and state-machine engine functions.
New rules built from supported operations require data changes; a fundamentally
new operation still requires reviewed code and capability metadata.

## Typing and evaluation

Bool, Number, Enum, Text, Timestamp and Object use the existing FieldSchema.
Enums carry catalogs; schemas also declare units, required fields and physical
state. Contracts keep independent typed output fields and available_projection.
Source type boolean/numeric/text provides its obvious input type; other source
types must declare value_schema before feeding a typed declarative input.
External references use the existing source and contract.field resolver.

Internal `ref` rules form an acyclic graph. Named rules are memoized once per
evaluation, including stateful rules. Boolean operations retain three-valued
logic and decisive evidence. Fusion argument order is deterministic priority.
First-match uses existing selection-blocked semantics. No prospective values
are calculated by validation or impact analysis.

Temporal and bucket nodes have unique stable IDs within a definition. Temporal
contexts live under the producer node; the existing restore, gap and scheduling
paths include those contexts. Hysteresis latches are **volatile**, exactly like
the registered Alpha-3 Bucket. Process restart and database recovery start them
at `initial`; an unusable input still resets the latch under existing G6 rules.
Pre-review Alpha-4 persisted latch entries are discarded. Temporal nodes retain
their separately permitted restore context; no latch is read from node_state.
Semantic changes invalidate the containing contract context; compatible restart
retains original Grace and deadline timestamps.

One state machine per contract preserves the current engine's episode, session
and single-deadline model. Guards and reinitialization conditions can contain
stateless nested rules and references. A temporal condition can be supplied as
a typed contract input. Stateful operations inside a guard are rejected: a
guard queried by a command must not mutate a producer context before the staged
override evaluation. Commands have closed argument schemas and request named
guarded transitions; no set_state capability exists.

Each `(source, event)` pair occurs at most once in a declarative machine.
Duplicates are rejected at `/machine/transitions/{index}/event`; guard ordering
does not create alternatives to the engine's first matching transition. A
declared machine must be reachable from an output, directly or through named
rules, otherwise validation rejects `/machine`. These rules do not alter the
registered Alpha-3 machine engine.

Declarative map keys are canonical JSON scalar literals: `true`, `false`, a
plain decimal number without redundant fraction zeros/exponent (`42` also
matches 42.0; both zero signs map to `0`), or a JSON-quoted string. Text, enum
and timestamp string keys compare their exact string content; timestamp maps
do not normalize alternate timestamp spellings. Keys must match the input type
and catalog. Entry failures identify the escaped JSON Pointer to the key.
Legacy catalog bindings and registered map producers keep their Python-str
key contract unchanged.

Evaluation errors discard producer-local node/latch/refresh mutations using the
existing transaction path. A command cannot return accepted after its override
evaluation fails. Publications occur only after commit. No actor actions are
added.
An inherited `evaluation_error` is evidence metadata, not a local exception.
The declarative formula adapter raises locally caught engine errors into the
existing rollback boundary. Fusion may still select another healthy candidate
and preserve `partial_evidence`; downstream temporal/machine contexts can commit.

## Compatibility and persistence

Old type descriptions and source fingerprints are preserved when the additive
fields are absent and fingerprint_version remains 1. Declarative definitions add a hash of the complete semantic
definition, excluding only top-level editorial metadata. This prevents a field
named description or display_name from disappearing from semantic identity.

The existing generic JSONB tables store definitions in registry revisions,
draft metadata in registry_draft, audit events in diagnostic_event and bounded
current explain data in node_state. No new table or migration is required.
Installation identity, epoch and publication sequence semantics remain intact.
Old historical rows remain readable; historical evidence never recorded by an
older runtime cannot be reconstructed and resolves explicitly as not found.
Version-2 evidence references include the registry revision and adapter, in
addition to epoch, sequence and binding. Version-1 references remain resolvable;
clients continue to treat evidence references as opaque strings. Historical
episode/deadline ownership is resolved through transitions when Alpha-3 records
lack a contract ID. None of these reads rewrites stored history.

Pure v1 registry writes omit the additive default `fingerprint_version:1`,
empty definitions and absent source schemas; v1 observation writes omit the
default reference version. Released Alpha-3 golden documents guard exact stored
shape and checksum compatibility. Actual v2 fields remain explicit. This is
not a blanket binary downgrade guarantee: all revisions, drafts, observations
and runtime state must be compatible. Use the [downgrade runbook](../alpha4/downgrade.md)
and a matching `/data` plus database backup after any Alpha-4-only activation.

## Public administration and safety

The same registry and definition schemas describe imports and manual editing.
Drafts permit incomplete documents, but reject null, non-object data, secrets
and oversized documents. The API offers unsaved validation, full document
editing, listing, deletion with OCC, activation and rollback. A form editor can
edit every element of the exported document; import has no privileged path.

Validation returns stable codes, JSON Pointer paths and object IDs. Pydantic
input values and contexts are never reflected. Static impact includes registry
objects, direct/transitive consumers, changed fingerprints and potential restore
invalidations. It never evaluates a draft or predicts future truth values.

Administrative audit rows contain operation, authenticated role/boundary,
object/revision IDs and timestamps. Client identity headers are not trusted.
Token rotation records a durable intent before touching the token file and a
completion after success. An intent without completion is an indeterminate
outcome, not proof that rotation completed. Token material is never audited.
After a successful file rotation the HTTP response is 200 with the new token,
`status:rotated`, a correlation `rotation_id` and `audit_status:complete` or
`completion_unconfirmed`. A failed completion/ack must never hide the committed
credential behind an HTTP error. Failure to commit intent prevents rotation.
There is no transaction spanning PostgreSQL and a token file; a lost HTTP
connection can still require recovery through the existing trusted local/Ingress
administrative boundary. Do not retry rotation automatically.

HA entity discovery is admin-only and uses the configured authenticated HA
read-only connection. It issues get_states, exposes binding-selection metadata,
and performs no service calls or helper creation. No existing HA installation
is changed by this implementation.

## Resources and retention

Documents: 2 MB and depth 32. Definitions: 128 per registry, 256 physical rule
nodes, nested rule depth 16, 64 inputs, 32 outputs. Evaluation has an explicit
512-step budget. Drafts: at most 100, names at most 256 characters.
The enabled declarative registry has an 8,192-step aggregate budget. Version-2
source and contract graphs have a maximum dependency depth of 64. Diff field
paths are capped at 1,024 per changed object with an explicit truncation marker.

Explain retains the latest relevant committed evaluation for each contract. An
unrelated-source evaluation with unchanged trace content keeps the previous
`at` and `origin`; these identify the last relevant evaluation, not a global
processor heartbeat. Changed trace metadata, revision or epoch updates it.
It contains operator/status/reason/evidence metadata, explicit machine guard
decisions and fusion selection indices. Input, literal, reference and generic
operator steps contain **no raw values, including booleans**. Guard decisions
are deliberately disclosed control-flow outcomes, not a general value export.
No command arguments, tokens or arbitrary attributes are included. Evidence
lists in a trace step are capped at 64; persisted traces have at most 1,024
records and report truncation explicitly. Failed evaluation does not advance the
trace. There is no unbounded explain history.

History endpoints return at most 200 rows with deterministic time/key ordering,
opaque scope-bound cursors and UTC time filters. They query persistence without
loading history into the runtime. Cursors provide keyset traversal, not a
long-lived database snapshot; episode/deadline rows can evolve between requests.
Existing durable history and command idempotency retention is unchanged.
UTC timestamps are compared as instants in both memory and PostgreSQL, including
fractions and timezone spellings. New cursor timestamps are canonical UTC;
old version-1 cursor encodings remain parseable. Start a fresh cursor when
upgrading an already running traversal to the corrected ordering.

Exact current observation references use the existing primary-key index first;
the computed legacy reference scan is only a fallback for old identities.
Unchanged reports still carry new measurement/freshness evidence and therefore
remain distinct history rows. Deleting/coalescing them would need an explicit
evidence-retention contract. The isolated [review probe](../../dev/review_probe.py)
records write counts, growth and query plans; the bounded follow-up and scale
limits are in the [review matrix](../alpha4/opus-review-corrections.md).

Types are composed once per evaluation/scheduling/diff pass. The existing
128-entry compilation cache is keyed by the complete canonical definition,
including its version. Neither draft mutation nor an editorial/version change
can reuse a different definition's compiled evaluator. No global mutable
registry or new persistent cache is introduced.

Entity discovery caches for 15 seconds, caps the HA response at 4 MB/10,000
entities and returns at most 200 entities per page. Static immutable caching
applies only to fingerprinted assets, never HTML, APIs or unversioned files.

## Acceptance

G1–G15 remain unchanged. Proposed additional technical gate G16:
a complete synthetic contract cascade is authored solely as registry data,
validated, diffed, activated, observed through snapshot/WS/client, restarted,
semantically changed, rolled back, explained and exported/reimported through
public APIs. Automated evidence is recorded in the Alpha-4 completion matrix.
Real HA/Supervisor installation, transport timing and operator Live acceptance
remain separate human gates. Phase 1B owns its frontend stack and full UX.
