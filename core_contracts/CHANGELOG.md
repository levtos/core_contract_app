# Changelog

## 1.0.0a6 — UX12-Korrekturen (vorbereitet, 2026-10-15)

- Korrekte HA-/Bridge-Statusanzeige, historische Typ-/Einheitssperre und ausdrückliche
  HA-Typumwandlung samt Reparaturknopf und Prüfung.
- Datengestützte Ablauf-Wiederherstellung und verständliche Diagnose; manueller Neustart
  ausschließlich als ADR-Entwurf, keine Implementierung.
- Dialoge, Entwurfskonflikte, Assistent, Grenzwerte, Meldungen, Logs und Zahlenanzeige korrigiert.
- Deutsche Oberfläche über de.json, Terra/Einstellungen und Sprachprüfungen in CI.
- [Alpha-6-Notiz](https://github.com/levtos/core_contract_app/blob/main/docs/releases/1.0.0a6.md).
  Kein Merge/Release/Publishing/Deployment/DB-Reset ohne Bennis Go; Live-Abnahme offen.

## 1.0.0a5 — Terra Workbench (2026-10-14)

- React 19 administration UI with graphical Alpha-4 editors, Registry Studio, graph, diagnostics and administration.
- Independent review fixes T1B-01–T1B-07/UX-01 and C1–C8: safe drafts/activation, typed values/catalogs,
  dynamic schemas, protected token handling, tab-wide request budget, honest live/explain data and lossless roundtrip.
- Flexible panels: drag-and-drop/keyboard order, widths, installation-scoped persistence and reset; editor state retained.
- API/Bridge protocols, database schema and installation identity unchanged; no new backend feature.
- Not verified: visible Firefox/Touch, real HA-Ingress/Supervisor embedding, real discovery,
  accessibility and Live acceptance. Installation and final Live status remain Benni's gate.
- [Alpha 5 notes and publication evidence](https://github.com/levtos/core_contract_app/blob/main/docs/releases/1.0.0a5.md).

## 1.0.0a4 — Declarative Platform (prepared)

- Declarative contract definitions and state machines as registry data on the existing engines.
- Manual-first Workbench APIs: drafts, validation, diff/impact, activation, rollback, export.
- Diagnostics, explain, bounded history, evidence resolution, audit and read-only HA discovery.
- Preserve installation identity, database schema, released v1 storage shape and API/Bridge protocols.
- Opus review corrections included; F1/F2 scale follow-ups and Live acceptance remain open.
- Publication pending; no automatic installation or Live acceptance.
- [Alpha 4 release preparation](https://github.com/levtos/core_contract_app/blob/main/docs/releases/1.0.0a4.md).

## 1.0.0a3 — Phase 1A (prepared)

- Reusable producer kit, multi-field contracts and multistage graph/restore coverage.
- Dependency monitoring, declared source refresh, typed commands and MQTT-only readiness.
- Atomic command rejection on producer failure and lifecycle regression tests.
- Visible setup diagnostics for invalid existing Supervisor options.
- Preserve installation identity, database schema and existing API/Bridge protocols.
- Publication pending; no automatic installation or Live acceptance.
- [Alpha 3 release preparation](https://github.com/levtos/core_contract_app/blob/main/docs/releases/1.0.0a3.md).

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
