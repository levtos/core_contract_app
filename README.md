# Core Contracts App

Core Contracts als **Supervisor-verwaltete Home-Assistant-App**: kanonische fachliche Wahrheiten mit
Status, Quality, Freshness, Evidence und Reasons. Dazu kommen Registry mit stabilen IDs, PostgreSQL-Persistenz,
Thin HA I/O Bridge und `CoreContractsClient`.

**Stand:** Planung abgeschlossen; **Phase 1 — Platform Foundation (Alpha 1)** steht zum Bau an.

| Phase | Inhalt |
|---|---|
| **Phase 1 — Platform Foundation (Alpha 1)** | generische Plattform; nur synthetische `test.*`-Contracts |
| **Phase 2 — Domain Contracts + Consumer Migration** | reale Contracts einzeln je Domäne, erst nach dem Acceptance Gate von Phase 1 |

## Dokumentation

- [Platform-Alpha-1-Build-Spezifikation](docs/platform-alpha1/build-specification.md): **primäre Build-Quelle**
- [Codex-Build-Prompt Phase 1](docs/platform-alpha1/codex-build-prompt.md)
- [Technischer Baseline-Check](docs/audits/technical-baseline-check-2026-10-07.md)
- [Delta-Audit Core-Profile](docs/audits/profile-delta-audit-2026-10-07.md)
- Übersicht und Historie: [docs/README.md](docs/README.md)

Die bisherige HA-Integration (v0.2.x, Legacy) liegt in
[Levtos/core-contracts](https://github.com/Levtos/core-contracts) und bleibt bis zur Ablösung in Phase 2 unverändert.
