# Changelog

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
