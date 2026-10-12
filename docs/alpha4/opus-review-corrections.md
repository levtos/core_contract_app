# Alpha-4 consolidated Opus delta corrections

Scope: existing PR [#14](https://github.com/levtos/core_contract_app/pull/14),
reviewed baseline `5c84026aef9f0c1c7c0f85f4d6d39279ead06c5a`.
No version, release, publication, deployment, HA/Bridge/Legacy installation or
Phase-1B UX change. G1–G15 and proposed G16 remain binding. Independent Opus
delta review and human Live acceptance are still open.

The original review classified A4-01/02 HIGH. Other severity labels below are
implementation risk classifications, not invented quotations from Opus.
The final head, full CI link and measured CI performance artifact are recorded
in the PR/Issue #13 evidence; earlier green runs do not certify this delta.

## Disposition and evidence

`review` below means `tests/test_alpha4_review.py`; `PG` means
`tests/test_postgres.py`; `probe` means `dev/review_probe.py`.

| Finding / severity | Correction or explicit boundary | Regression / measurement | Compatibility and remaining risk | Alpha-4 release blocker after successful checks |
|---|---|---|---|---|
| A4-01 HIGH, persisted hysteresis | Bucket uses staged volatile latches only; pre-review persisted latch discarded; restart/recovery resets initial independently of grace | review `test_bucket_restart_resets_only_latch`, parity helper `exercise_latch_restore`; PG `test_review_hysteresis_recovery_and_time_filters` | Restores Alpha-3/G6 semantics; original grace expiry retained; fresh snapshot still required | No, erroneous restore path removed |
| A4-02 HIGH, propagated execution error | Local formula execution failures raise into rollback; inherited reasons remain ordinary evidence | review `test_local_failure_does_not_poison_fusion_temporal_or_commands`; existing command local-failure rollback/replay test | Registered formula behavior unchanged; fusion partial evidence, consumer fields, temporal state and accepted commands exercised | No, local failure boundary tested |
| A4-03 MEDIUM, unreachable duplicate transition | Reject duplicate source/event pairs at exact event JSON Pointer; distinct sources may use same event | review `test_duplicate_transition_and_unreachable_machine_paths`; existing successful declarative command/restore tests | Legacy first-match engine unchanged; no speculative alternative-guard semantics introduced | No, ambiguous declarations cannot activate |
| A4-04 MEDIUM, inactive machine | Require machine reachability from output through internal rule references | Same review path test, positive named-ref reachability | Unused machine definitions now rejected; guards remain stateless | No, inactive valid-looking machine rejected |
| A4-05 MEDIUM, Python map key representation | Canonical JSON scalar keys, normalized decimal numbers, typed/catalog-checked entries | review `test_canonical_declarative_map_and_legacy_parity`, `test_noncanonical_map_rejected_at_entry`, `test_map_key_must_belong_to_input_catalog` | Only unreleased declarative syntax changes; legacy maps retain Python-str keys; timestamp strings compare exact content | No, representation and compatibility explicit |
| A4-06 HIGH, lost token on audit failure | Commit intent first; return successfully rotated token even if completion/ack fails, with correlation ID and explicit audit status | review `test_rotation_failure_contract` (intent, file failure, completion failure, lost completion acknowledgement); successful rotation API test | Additive response fields; token never audited/logged; process/network loss cannot be made atomic across DB/file/HTTP | No, committed credential no longer hidden by audit failure |
| A4-07 MEDIUM, misleading downgrade | Preserve released durable pure-v1 registry and observation format; explicit extensions remain explicit; backup-pair runbook | Actual released-model golden fixtures; review `test_alpha3_storage_golden_activation_and_observations`; fixed Alpha-3 fingerprints and prior PG upgrade/rollback tests | Any incompatible historical data still requires compatible backup pair; active-registry rollback alone is insufficient | No, compatibility promise narrowed and exact old shape tested |
| A4-08 MEDIUM, explain writes | Unchanged unrelated-source trace preserves its last relevant confirmed timestamp/origin; changed evidence/epoch/revision still updates | review `test_unrelated_source_does_not_write_explain_or_leak_boolean`; PG probe asserts **zero node writes for 1,000 foreign reports** | `at` means last relevant evaluation; no unbounded trace history; global graph evaluation remains | No, avoidable writes removed and measured |
| A4-09 MEDIUM, observation growth/access | Exact evidence uses existing PK index; no scan for missing v2 reference. Preserve distinct reports for freshness/evidence integrity; no silent deletion | PG probe: 1,000 reports at simulated 100/s, 100,000 seeded rows, actual sizes/latencies and EXPLAIN ANALYZE BUFFERS for PK and history filters | Observation history remains unbounded; latest/filter history and legacy computed-reference fallback can scan. Follow-up F1 below is mandatory before production scale | No for synthetic Alpha-4 scope; **production-scale gate stays open** |
| A4-10 MEDIUM, string time ordering | Memory and SQL compare UTC instants, fractions/offsets included; cursor contains normalized time | review `exercise_history_times`, PG `test_review_history_time_filters` in its own isolated database; equal-instant tie keys and inclusive filters | Cursor v1 retained; restart a traversal across upgrade; no snapshot-isolation guarantee across pages | No, ordering corrected in both stores |
| A4-11 MEDIUM, unsafe draft IDs | ASCII URL-safe bounded ID grammar shared by all new/updated drafts | review valid-ID full HTTP CRUD and unsafe-ID rejection parameters | Generated UUIDs unchanged; historical malformed IDs are not silently renamed | No, all newly accepted IDs addressable |
| A4-12 MEDIUM, raw boolean traces | Remove generic `decision` values from input/literal/ref/operator trace steps; expose only deliberate guard outcomes and fusion selections | review trace regression; existing fusion-selection and secret-redaction tests | No expanded disclosure; contract explicitly distinguishes raw values from control-flow decisions | No, code and documented disclosure agree |
| A4-13 LOW, metadata roles | Document consumer-visible types/capability definition metadata and admin-only config/history/diagnosis routes | `test_schema_capabilities_and_reason_catalog`, existing history/role and spoof-audit tests | No role widening; registry literal metadata is not secret storage | No, supported boundary explicit |
| A4-14 LOW, discovery scale | Oversized count/transport responses fail closed with generic 503 and no partial cache; explicit Live gate below | review `test_discovery_oversized_responses_fail_closed` for >10,000 entities and >4 MB; prior cache/redaction/role test | HA get_states is not server-paged; large installations may be unsupported at this limit | No backend blocker; genuine HA acceptance remains open |
| A4-15 LOW, HA-user attribution | Keep role/trusted-boundary audit identity. Optional user attribution deferred until a verified Ingress identity contract exists | Existing actor spoof regression; rotation audit tests | No client identity header is trusted; individual HA users cannot yet be attributed | No, optional extension safely excluded |
| A4-16 MEDIUM, incomplete capability metadata | Enumerate all history kinds, role/order/cursor/bounds, semantic validation rules, model constraints, map/ID contracts | Extended `test_schema_capabilities_and_reason_catalog` | Additive metadata; server validation remains authoritative and safe structural code families unchanged | No, Workbench discovers supported options |
| A4-17 MEDIUM, repeated type composition | Hoist type registries out of per-contract evaluation/scheduling/diff loops; retain full-definition-keyed bounded compiler cache | Probe 1/256/1,024 contracts and 128 definitions; registration count assertion; existing immutable-version/fingerprint tests | Three compositions per input independent of instance count; no mutable cross-revision registry cache; remaining linear graph work measured | No, repeated per-contract registration removed; F2 scale follow-up below |

## Performance evidence and decisions

CI runs `dev/review_probe.py` after all tests and retains
`alpha4-review-performance.json` in the `python-wheels` artifact. It creates and
drops a uniquely named database only when `TEST_DATABASE_DSN` names a `_test`
database; no production connection is accepted. A temporary trigger counts
actual node INSERT/UPDATE statements. No app migration/index is added.

One local Windows/Python 3.14.5 run measured:

| Contracts / definitions | Cold / warm validation ms | Diff ms | Input transaction ms | Type registrations/input |
|---|---:|---:|---:|---:|
| 1 / 1 | 3.617 / 0.323 | 2.168 | 1.616 | 3 |
| 256 / 1 | 8.244 / 8.139 | 103.818 | 107.725 | 3 |
| 1,024 / 1 | 32.955 / 31.453 | 432.766 | 434.094 | 3 |
| 128 / 128 | 27.184 / 16.250 | 71.310 | 76.077 | 384 |

These are observations, not latency guarantees; CI supplies independent Linux
and PostgreSQL measurements on the reviewed head. The PG run records median
and p95 serial transaction latency, report/history row growth, relation bytes
per row and actual query plans/execution times at 100,000 seeded observations.
Reports are offered with 10 ms source-time intervals; measured throughput is
the recorded serial processing time, not a claim that 100/s is sustainable.

Retention decision: do not deduplicate fresh heartbeats by value. Each may
extend freshness and be referenced by a committed envelope. Deletion without
reference-aware policy would weaken evidence/history. Existing primary-key
lookup is sufficient for exact modern evidence; a broad time index requires
an explicit migration and operational sizing beyond this correction.

**F1 (A4-09, production-scale prerequisite):** define reference-aware observation
retention and old-evidence resolution behavior, then design versioned query
indexes/partitioning with migration/restart/rollback tests. Re-measure 100k,
1M and the intended retention horizon using this probe. Record P95 history and
evidence latency plus disk growth; choose an explicit storage and latency budget
before productive domains or sustained high-rate sources are accepted. At one
report/s there are 86,400 new observation rows/day; multiply by measured bytes/row
and source count, allowing separately for WAL, backups and bloat. A bounded page
does not imply bounded query work or storage. The existing 10-second DB command
timeout is a failure bound, not a performance target. Track F1 under Issue #13's
release evidence; it cannot be marked complete by the synthetic probe alone.

**F2 (A4-17, scale prerequisite):** the remaining full-graph transaction cost is
visible at 1,024 contracts. Benchmark the intended source rate and graph before
accepting that scale; consider affected-subgraph reuse only with command,
freshness, deadline, recovery and atomic-publication equivalence tests. No
second runtime or risky graph-scheduler redesign is introduced in this delta.

## Second delta review: D2-01 and D2-02

Correction baseline: `9c7925c56f259b8c5e89834fc97b1837e044a96c`.
This delta changes only the two paths below and their regression evidence.
The accepted F1/F2 follow-ups and the previous A4-01–A4-17 decisions stay unchanged.
The final commit and complete CI run are recorded in PR #14's completion comment.

| Finding / severity | Correction and regression evidence | Compatibility / remaining risk / blocker |
|---|---|---|
| OPUS-A4-D2-01 / HIGH | Machine reachability memoizes both true and false answers by rule name within one definition check. Existing reference/cycle/type/resource validation runs unchanged. `test_fanout_reachability_is_bounded_and_definition_local` covers seven levels, fan-out 35, 253 named-rule nodes (256 total including outputs/reinitialization), cold validation <100 ms, unreachable rejection and isolation between definitions. `test_machine_direct_and_indirect_reachability` and `test_fanout_preserves_depth_node_and_cycle_limits` protect reachability and limits; `test_evaluation_cost_limit_remains_effective` protects the 512-invocation bound. `test_health_http_request_concurrent_with_cold_validation` sends a real second-socket HTTP request when the POST validator starts, requiring a 200 health response within 200 ms. | No global/revision cache, schema or semantic changes. Timing assertions are regression bounds for this synthetic definition, not a general latency guarantee for large registries (F2 unchanged). Implementation blocker: no; independent two-path delta confirmation remains required. |
| OPUS-A4-D2-02 / MEDIUM | The read-only declarative guard boundary classifies local arithmetic, lookup, type and value failures as `GuardEvaluationError`. Only that exception is converted by the command path to `rejected/evaluation_error`; the normal transaction persists the command result with no override/evaluation/publication. `test_guard_error_http_persistence_and_restart` reproduces ZeroDivisionError through HTTP, verifies stored result and identical replay before/after a fresh Runtime, and confirms healthy guards still transition. `test_delta2_guard_error_persistent_http_replay_after_restart` repeats the HTTP assertions against PostgreSQL and reopens both Store and Runtime before replay. | No command/API/schema/fingerprint change. Both stores preserve all other persisted tables; publication sequence, complete node/SM contexts (including deadline), latches and pending refresh remain unchanged on rejection. Replay performs no commit. `test_guard_rejection_does_not_mask_infrastructure_failure` covers guard infrastructure, command lookup and commit errors: 503 and no persisted rejection. Infrastructure failures still require normal recovery; they are not successful command decisions. Implementation blocker: no; independent delta confirmation remains required. |

All new in-memory/HTTP tests are in `tests/test_alpha4_delta2.py`; the durable
restart test is in `tests/test_postgres.py`. No existing tests were weakened.
The PostgreSQL fixture uses an isolated test database, never a live installation.

Initial targeted run (Windows, Python 3.14.5): 89 tests passed across the new
delta tests, `test_declarative.py` and `test_alpha4_review.py`. Cold valid
fan-out validation: **6.970 ms**; unreachable variant: **5.940 ms**; concurrent
HTTP health response: **17.587 ms**. These are single local observations.
The final complete CI independently enforces the same timing bounds and includes
PostgreSQL, MQTT, HA kernel, frontend, lint/format/types/audits and both image
architectures. Reproduce timing properties with:

```sh
uv run pytest tests/test_alpha4_delta2.py -q -o junit_family=xunit1 --junitxml=delta2.xml
```

## Live gates and test-contract adjustments

- A4-14: on a separately authorized HA installation verify trusted Ingress,
  actual get_states response size/count/latency, 15-second cache behavior,
  paged binding selection and deliberate 503 handling. A >4 MB or >10,000
  response is rejected whole, not silently truncated. No HA services are called.
- A4-15: audit remains token-role or trusted Ingress-boundary attribution. An
  optional individual-user enhancement needs authenticated boundary evidence;
  forwarded/client headers alone do not qualify.
- Existing map tests now use the specified declarative keys and additionally
  prove legacy keys unchanged. The prior test that required a persisted bucket
  latch now checks volatile state and absence of persistence, with restart/PG
  parity added. Existing observation-ordering tests still compare every stored
  field, using the deliberate v1 storage shape; actual Alpha-3 golden fixtures
  independently protect that shape. No failure scenario or acceptance assertion
  was removed to obtain green CI.
