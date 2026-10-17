# Mimir — Core Contracts

Core Contracts als **Supervisor-verwaltete Home-Assistant-App**: kanonische fachliche Wahrheiten mit
Status, Quality, Freshness, Evidence und Reasons. Dazu kommen Registry mit stabilen IDs, PostgreSQL-Persistenz,
HA-Bridge Bifröst und `CoreContractsClient`.

**Stand:** Alpha 8 im Review auf `agent/codex-alpha8-mimir`. Mimir erhält den
neuen Supervisor-Slug `mimir` und eine eigene Datenbank. Vorlagen dürfen freie
Kennungen verwenden; die frühere Beschränkung auf `test.*` und Fixtures ist gelöst.
Die mitgelieferten Beispiele bleiben synthetisch. Release, Installation und reale
Supervisor-/HA-Abnahme benötigen Bennis Teil-B-Go.

| Phase | Inhalt |
|---|---|
| **Alpha 8 — Mimir** | Zeit/Kalender, Instanzparameter, n-Klassen, Textregeln, Kataloge, Vollständigkeit, Aufbewahrung |
| **Weitere Domänen und Consumer-Migration** | gesonderte Aufträge; vorhandene Terra-/Legacy-Installationen bleiben erhalten |

## Dokumentation

- [Alpha-8-Auftrag und Entscheidungen](docs/alpha8/README.md), [Abnahme](docs/alpha8/ABNAHME.md)
- [Namenskonzept](docs/naming.md), [neue Mimir-Datenbank: vorbereitetes Runbook](docs/operations/mimir-new-database.md)

- [First-Run-Wizard, DB-Provisionierung und offene Bridge-Grenze](docs/first-run.md)
- [Betrieb, Installation und Backup/Restore](docs/operations.md)
- [API und Python-Client](docs/api.md)
- [Wiederverwendungsanalyse](docs/platform-alpha1/reuse-analysis.md)
- [Technische Auslegungen](docs/platform-alpha1/deviations.md)
- [Build-Time Verification](docs/platform-alpha1/build-time-verification.md)
- [Abschlussbericht / G1–G15](docs/platform-alpha1/completion-report.md)

- [Platform-Alpha-1-Build-Spezifikation](docs/platform-alpha1/build-specification.md): **primäre Build-Quelle**
- [Codex-Build-Prompt Phase 1](docs/platform-alpha1/codex-build-prompt.md)
- [Technischer Baseline-Check](docs/audits/technical-baseline-check-2026-10-07.md)
- [Delta-Audit Core-Profile](docs/audits/profile-delta-audit-2026-10-07.md)
- Übersicht und Historie: [docs/README.md](docs/README.md)

Die bisherige HA-Integration (v0.2.x, Legacy) liegt in
[Levtos/core-contracts](https://github.com/Levtos/core-contracts) und bleibt bis zur Ablösung in Phase 2 unverändert.
