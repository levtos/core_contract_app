# Changelog

## 1.0.0a2 — First-Run-Wizard

- German Ingress setup before database initialization, private resumable configuration.
- Guided local PostgreSQL provisioning/import and existing-identity preservation.
- Bridge detection and confirmed configuration; HACS installation remains manual.
- Existing installations: keep Supervisor options; do not hand the DB to the wizard.
- Back up App /data and external PostgreSQL together before updating.
- [Upgrade, rollback and limitations](https://github.com/levtos/core_contract_app/blob/main/docs/releases/1.0.0a2.md).

## 1.0.0a1 — Platform Foundation

- Generic registry, evidence, quality, resolver/fusion/temporal/state-machine framework.
- PostgreSQL writer lock, atomic changesets, epochs and restore.
- Thin HA bridge, MQTT ingestion, HTTP/WS, Python client and Ingress administration.
- Only synthetic test fixtures; no release or deployment performed by the build.
