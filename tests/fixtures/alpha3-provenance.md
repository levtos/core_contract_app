# Released-model fixtures

`alpha3-registry-v1.json` and `alpha3-observation-v1.json` were serialized by
the actual `RegistryConfig` and `Observation` classes from release `v1.0.0a3`,
commit `8adb44bf87d77c40bf518e0b8dbf7e1fd0d08ec6`, using
`model_dump(mode="json")`. They were not produced by Alpha 4.

The registry input is that commit's
`docs/platform-alpha1/phase1a-test-registry.json`. The observation is a synthetic
HA report at `2026-01-01T12:00:00Z`, epoch `alpha3-golden`, sequence 1.
The regression requires exact JSON document equality after Alpha-4 parsing,
durable serialization, activation and rollback. Default-only Alpha-4 fields
must not appear. Explicit version-2 content stays explicit and is incompatible
with the old binary; see the downgrade runbook.
