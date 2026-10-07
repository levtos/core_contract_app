# Platform Alpha 1 — Build-Nachweise

Tracking: [Issue #1](https://github.com/Levtos/core_contract_app/issues/1), `agent:codex`,
Branch `agent/platform-alpha1`. Der Build arbeitet ausschließlich in diesem neuen
Repository. CI-Nachweise werden vor dem abschließenden PR-Bericht ergänzt.

## Implementiert

| Gate | Implementierung und Nachweis | Status |
|---|---|---|
| G1 Installation | Multi-stage Python 3.14, root-Vorbereitung und non-root Python; lokales App-Staging | Supervisor-Smoke offen |
| G2 Bridge | Admin-WS, info, Snapshot/absent/changed/reported, Fake-HA-Protokolltests | Fake-HA bestanden; echter HA-Test offen |
| G3 Registry | stabile Sources/Bindings, Draft-OCC, Validierung, atomare Aktivierung, Rollback als neue Revision, Admin-UI | Tests; UI-Smoke offen |
| G4 Isolation | Identitätsmatrix, explizite Adoption/Initialisierung, mismatch-Abweisung | Tests bestanden |
| G5 Persistenz | PostgreSQL-Tabellen, Migrationsrunner, persistierter Registry-/Runtime-Kontext | PostgreSQL-CI ausstehend |
| G6 Restore | Startfälle, Fingerprints, Grace-Restzeit, Baseline, Latch-Reset, absolute Deadlines, keine erfundene Kontinuität | Restore-Tests bestanden |
| G7 Publication | alle fünf `test.*`-Producer durch denselben Changeset-/Publication-Pfad | synthetische E2E-Tests bestanden |
| G8 Client | echte HTTP-/WS-Tests, Snapshot/Delta, Sequenzlücke/Epoche/Resync, Command-ID | Tests bestanden |
| G9 DB-Ausfall | kein sichtbarer Stand vor Commit, Freeze/Recovery, neue Epoche/Gap; dedizierter Writer-Lock | Fehlerinjektion bestanden; PostgreSQL-CI ausstehend |
| G10 Health | Liveness und Readiness getrennt; nur Liveness als Watchdog-Ziel | Tests; Supervisor-Ausfall-Smoke offen |
| G11 Quality/Evidence | fünf Status, Reason-Pflicht, Held, Quellzeit, Freshness, Retain/Deduplikation | Tests bestanden |
| G12 enabled | Drafts ohne Evaluation, deaktivierte Contracts aus Publication entfernt, neue Aktivierung mit Kontextprüfung | Tests bestanden |
| G13 Scope | nur fixture:true / test.* registriert, Registry- und AST-Wächter | Tests bestanden |
| G14 Qualität | Ruff, strict mypy, Python-/Frontendtests, Wheels, Image-Matrix | lokale Runde / CI siehe unten |
| G15 Doku | Betrieb, API, Wiederverwendung, Abweichungen, Build-Time-Checkliste | vorhanden; Review offen |

Die API/Adapter/Packaging entsprechen §§13–22, Operations/Backup §§23–24,
Toolchain §25 und Admin-UI §26. Keine produktiven Domain-Contracts.

## Wiederverwendet

Generische Mechanismen aus Graph, Quality/Freshness, Registry/OCC, kanonischer
Serialisierung und Import-Schutz wurden angepasst. Die Svelte-Toolchain wurde
übernommen und aktualisiert. Einzelentscheidungen und Herkunft:
[reuse-analysis.md](reuse-analysis.md).

## Entfernt / superseded

Keine Legacy-Datei wurde verändert. Profil-/Gate-/Shadow-/HA-Store-/Consumer-
Pfade, reale Schemas und Domain-Fusion wurden nicht übernommen. Der alte Auftrag
`core-contracts#46` bleibt superseded. Nicht eindeutig wiederverwendbare
Migrationen/Stores/UI-Seiten sind als REVIEW dokumentiert.

## Tests bestanden

Die finale Befehlsrunde und exakten Zähler werden nach dem CI-Lauf ergänzt.
Aktuelle lokale Prüfungen umfassen Kern, Registry, Identity, Restore, Runtime,
echte API-/Client-WebSockets, Fake-HA, MQTT, Scope und Packaging.

## Tests nicht ausführbar

Lokales Docker/PostgreSQL fehlt. PostgreSQL-Tests melden ausdrücklich
`skipped: environment` ohne `TEST_DATABASE_DSN`; CI stellt PostgreSQL bereit.
Keine reale HA-/Supervisor-Umgebung wurde installiert oder verändert.

## Build-Time Verification offen

Siehe [Checkliste](build-time-verification.md): Supervisor-Installation,
Admin-Rechte, reale state_reported-Last, HA-Restart/Reload, Ingress/UI,
Services-MQTT, non-root-Rechte, SIGTERM und Backup/Restore-Smoke.

## Bekannte Alpha-Limits

- History-Retention/Partitionierung und große Historiendaten sind vertagt.
- Die Admin-UI ist ein Engineering-Werkzeug mit JSON-Drafts und Diagnoseansichten.
- Kein automatisches Phase-2-Gate: offene echte Umgebungsnachweise und unabhängiger
  Opus-Review bleiben erforderlich.

## Migration / Installationshinweise

Eigene App und DB, separate Bridge, neue Installation-ID und Tokens. Bestehende
Integrationen und Consumer bleiben unverändert. Lokales App-Staging und
konsistentes `/data`-/PG-Backup sind in [Operations](../operations.md) beschrieben.

## Abweichungen von der Spezifikation

Einzeln begründet in [deviations.md](deviations.md): lokaler Build-Kontext,
aktualisiertes Testwerkzeug, unvermeidliche generische Suchbegriffe und JSONB-
Tabellenlayout. Keine neue fachliche Semantik.

## Scope-Selbstcheck

Nur `test.echo`, `test.boolean`, `test.fusion`, `test.temporal`,
`test.state_machine`; alle `fixture:true`. Producer-Code liegt unter `testing/`.
Verbotene Registry-Felder werden abgewiesen. Die Volltextsuche wird zusammen
mit dem AST-/Registry-Wächter und den dokumentierten Clock-/Envelope-Namen
bewertet. Keine Consumer-/Policy- oder Legacy-Änderung.
