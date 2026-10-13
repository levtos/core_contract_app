# Changelog

## 1.0.0a5 — Terra Workbench (2026-10-14)

- New React 19 / TypeScript / Vite 8 / Tailwind 4 administration UI replacing the Svelte engineering UI:
  manual-first, capability-driven editors for all Alpha-4 definitions, rules, state machines, sources,
  bindings, catalogs and contracts; Registry Studio (drafts, validation, diff/impact, activation,
  rollback, OCC conflict handling); graph; diagnostics, history, explain, commands; administration.
- First-run assistant ported without functional or security changes.
- Frontend only: no backend, API, schema or legacy change. `dev/workbench_demo.py` is a local review aid.
- Independent review fixes T1B-01 through T1B-07 and UX-01: packaged frontend fixtures,
  safe draft selection, exact validated activation candidates, typed nested JSON values and
  catalogs, dynamic/recursive schemas, token cache isolation and direct text-catalog authoring.
- Additional corrections C1–C8: preserve edits across delayed saves; bind activation to draft
  version and active revision; shared request budget and 429 handling without write retries;
  typed enums/ref/allOf/null/open-object editing; honest incomplete explain data; sequenced
  live/resync/unknown states; member order/unknown metadata/node-ID preservation; saved freshness defaults.
- Flexible panels: collapsible fixed navigation, drag-and-drop and keyboard ordering, panel widths,
  installation-scoped layout persistence and reset without losing editor state or writing registry data.
- Release authorized by Benni; publication evidence is recorded in the GitHub Alpha pre-release.
  Visible Firefox/Touch, real HA-Ingress/Supervisor embedding, real discovery, accessibility and
  Live acceptance remain **not verified**. No automatic installation or registry activation.
- [Workbench evidence](docs/workbench/codex-review-fix.md) and [Alpha 5 release notes](docs/releases/1.0.0a5.md).

## 1.0.0a4 — Declarative Platform (prepared, 2026-10-12)

- Declarative Core Platform: closed, versioned rule language on the existing engines
  (three-valued boolean logic, compare, map, first-match, bucket, formulas, fusion,
  stable_for/dwell/grace/edge/delta/age) and data-defined state machines with typed commands.
- Manual-first authoring: draft CRUD with OCC and metadata, unsaved aggregate validation
  with JSON-Pointer issues, semantic diff and static impact, explicit activation, rollback,
  export and re-import through the same public APIs.
- Workbench APIs: capabilities and schemas, reason catalog, contract diagnostics and explain,
  bounded history with cursors, exact evidence resolution, read-only HA entity discovery,
  server time, readiness reasons on WebSocket, administrative audit.
- Alpha-3 compatibility: config schema 1, API/Bridge protocol 1, DB migrations and
  installation ID unchanged; pure v1 documents keep the released storage shape; declarative
  definitions require explicit `fingerprint_version: 2`. Downgrade only via a matching backup pair.
- Opus review corrections OPUS-A4-01–A4-17 and OPUS-A4-D2-01/D2-02 included; follow-ups F1
  (retention/indexes/production scale) and F2 (large graphs) remain open.
- Release preparation only; publication and HA/Supervisor Live acceptance remain separate gates.
- [Alpha 4 scope, publication and upgrade notes](docs/releases/1.0.0a4.md).

## 1.0.0a3 — Phase 1A (prepared, 2026-10-11)

- Reusable producer lifecycle, temporal/state-machine orchestration and multi-field contracts.
- Multistage graph/restore coverage, dependency monitoring, declared refresh and typed commands.
- Commands reject producer evaluation failures atomically; replay remains idempotent.
- Lifecycle regressions for semantic changes, removal, resume and ordered shutdown.
- MQTT-only readiness and visible diagnostics for invalid Supervisor options.
- Release preparation only; publication and Live acceptance remain separate gates.
- [Alpha 3 scope, publication and upgrade notes](docs/releases/1.0.0a3.md).

## 1.0.0a2 — First-Run-Wizard (2026-10-10)

- Ingress-only first-run wizard before database/identity, CSRF-protected setup API.
- Private resumable connection authority, local LXC provisioning and secret import.
- Existing Alpha identity/configuration retained, explicit initialize/adopt gates.
- Bridge onboarding through HACS with honest missing/restart ambiguity and release blocker.
- Explicit confirmed Bridge config-entry setup; persistent wizard completion separate from readiness.
- Alpha release authorized after Opus GO with limitations; no automatic live installation.
- Upgrade, backup, rollback and deferred review tasks: [Alpha 2](docs/releases/1.0.0a2.md).

## 1.0.0a1

Platform Alpha 1 Foundation, tracked in issue #1. See the app changelog and
`docs/platform-alpha1/completion-report.md` for exact evidence and open gates.
