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
paths include those contexts. Hysteresis retains its latch in the same node.
Semantic changes invalidate the containing contract context; compatible restart
retains original Grace and deadline timestamps.

One state machine per contract preserves the current engine's episode, session
and single-deadline model. Guards and reinitialization conditions can contain
stateless nested rules and references. A temporal condition can be supplied as
a typed contract input. Stateful operations inside a guard are rejected: a
guard queried by a command must not mutate a producer context before the staged
override evaluation. Commands have closed argument schemas and request named
guarded transitions; no set_state capability exists.

Evaluation errors discard producer-local node/latch/refresh mutations using the
existing transaction path. A command cannot return accepted after its override
evaluation fails. Publications occur only after commit. No actor actions are
added.

## Compatibility and persistence

Old type descriptions and source fingerprints are preserved when the additive
fields are absent. Declarative definitions add a hash of the complete semantic
definition, excluding only top-level editorial metadata. This prevents a field
named description or display_name from disappearing from semantic identity.

The existing generic JSONB tables store definitions in registry revisions,
draft metadata in registry_draft, audit events in diagnostic_event and bounded
current explain data in node_state. No new table or migration is required.
Installation identity, epoch and publication sequence semantics remain intact.
Old historical rows remain readable; historical evidence never recorded by an
older runtime cannot be reconstructed and resolves explicitly as not found.

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

HA entity discovery is admin-only and uses the configured authenticated HA
read-only connection. It issues get_states, exposes binding-selection metadata,
and performs no service calls or helper creation. No existing HA installation
is changed by this implementation.

## Resources and retention

Documents: 2 MB and depth 32. Definitions: 128 per registry, 256 physical rule
nodes, nested rule depth 16, 64 inputs, 32 outputs. Evaluation has an explicit
512-step budget. Drafts: at most 100, names at most 256 characters.

Explain retains only the latest committed evaluation for each contract. It
contains operator/status/reason/evidence metadata and boolean decisions, never
raw input values, command arguments, tokens or arbitrary attributes. Evidence
lists in a trace step are capped at 64. Failed evaluation does not advance the
trace. There is no unbounded explain history.

History endpoints return at most 200 rows with deterministic time/key ordering,
opaque scope-bound cursors and UTC time filters. They query persistence without
loading history into the runtime. Cursors provide keyset traversal, not a
long-lived database snapshot; episode/deadline rows can evolve between requests.
Existing durable history and command idempotency retention is unchanged.

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
