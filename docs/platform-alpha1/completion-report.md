# Platform Alpha 1 — Abschlussbericht

Tracking: [Issue #1](https://github.com/Levtos/core_contract_app/issues/1), `agent:codex`,
Branch `agent/platform-alpha1`. Technischer Stand: **Testing / Tests Pass**.
Das Acceptance Gate bleibt wegen realer Umgebungsnachweise und des anschließenden
unabhängigen Opus-Reviews offen.

## Implementiert

| Gate / Spezifikation | Implementierung und Nachweis | Stand |
|---|---|---|
| G1 · §14 | Python 3.14, Multi-Stage-Images amd64/arm64, App-Staging; dev/container_smoke.py prüft Python-Prozess UID 10001 und Token-Modus 0600 | Container bestanden; Supervisor-Installation offen |
| G2 · §13 | HACS-Bridge, Admin-WS, info, Snapshot/absent/changed/reported, gefilterte Events; tests/test_transports.py mit Fake-HA | Automatisiert bestanden; echter HA-Test offen |
| G3 · §10/26 | stabile Sources/Bindings, Draft-OCC, Validierung, atomare Aktivierung, Rollback als neue Revision, Import/Export, Admin-UI | Runtime-/Transporttests bestanden; realer Ingress-/UI-Smoke offen |
| G4 · §11 | komplette ID-Matrix, explizite Initialisierung/Adoption, Mismatch-Abweisung; tests/test_runtime.py | Bestanden |
| G5 · §12 | PostgreSQL, geprüfte SQL-Migrationen, Registry-/Runtime-Kontext über Neustart; tests/test_postgres.py und test_backup.py | PostgreSQL-CI einschließlich pg_dump/Restore bestanden |
| G6 · §9 | Grace-Restzeit, Kontinuitätsnachweis, Fingerprints, Edge-Baseline, Latch-Reset, absolute/überfällige Deadlines; tests/test_restore.py | Bestanden |
| G7 · §6/14 | fünf synthetische Producer durch denselben Source-/Changeset-/Publication-Pfad; test_all_fixture_producers_end_to_end | Bestanden |
| G8 · §15/16 | HTTP/WS-Client, Snapshot/Delta, prev_seq, Epoche/Gap/Resync, langsamer Subscriber, Commands und stabile IDs | Runtime-/Transporttests bestanden |
| G9 · §12/14 | Commit-before-publish, Freeze/Recovery, neue Epoche/Gap, exklusiver dedizierter Writer | PostgreSQL-Fehlerinjektion und Container-Smoke bestanden |
| G10 · §14.5/20 | getrennte Liveness/Readiness, Bootstrap bei fehlender DB, DB-Ausfall und SIGTERM <30 s | API-/Docker-Tests bestanden; Supervisor-Watchdog-Smoke offen |
| G11 · §7/8/18 | fünf Status, Reasons/Input-Pflicht, Held, Quellzeit, Freshness, Retain/Deduplikation, FakeClock/DST | Core-/Transporttests bestanden |
| G12 · §10 | Drafts ohne Evaluation, enabled, entfernte Publication, Kontextprüfung bei Reaktivierung, verbotene Registry-Felder | Bestanden |
| G13 · §6.8 | nur fixture:true / test.*; test_no_domain_contract_types und AST-Wächter | Bestanden |
| G14 · §25/28 | Ruff, Format, strict mypy, Backend-/Frontendtests, Wheels, Image-Matrix, Paket-Audit | Automatisierte Prüfkette; Befehle unten |
| G15 · §21–24/29 | API, Betrieb, Logging/Shutdown, Backup, Wiederverwendung, Abweichungen, Build-Time-Checkliste | Dokumentiert; unabhängiges Review offen |

MQTT (§17) dient nur als Eingangsquelle. Credentials bleiben serverseitig.
API und Ingress besitzen getrennte Listener und Berechtigungen (§19).
Ungültige Startoptionen werden ohne Konfigurationswerte oder Exception-Text geloggt.

## Wiederverwendet

| Bestandteil | Kategorie / Herkunft |
|---|---|
| Svelte/Vite/TypeScript, Bits UI, Tailwind, Lucide | KEEP/ADAPT · Legacy-Frontend-Toolchain |
| Graph-Zyklen, eindeutige Producer, Quality/Freshness, generische Fusion | ADAPT · Legacy-Graph/Quality; neue synthetische Testfälle |
| Registry-OCC, kanonisches JSON/SHA-256, Import-Schutz | ADAPT · Registry/Transfer; neue installation-lokale PostgreSQL-Grenze |
| Observation-Normalisierung | ADAPT · Source-Listener; neue Thin-Bridge-Grenze |

Einzelentscheidungen und überprüfter Bestand: [reuse-analysis.md](reuse-analysis.md).

## Entfernt / superseded

Keine Legacy-Datei wurde verändert. Profil-/Gate-/Shadow-/HA-Store-/Consumer-Pfade,
reale Schemas und Domain-Fusion wurden als REMOVE/REVERT FROM ALPHA1 nicht übernommen.
Der alte Auftrag `core-contracts#46` bleibt superseded. Alte Migrationen, private
asyncpg-Anpassungen sowie UI-Seiten/Stores wurden als REVIEW nicht übernommen:
Schema und Lifecycle passen nicht zur neuen App-Grenze.

## Tests bestanden

Die Prüfkette ist in [ci.yml](../../.github/workflows/ci.yml) reproduzierbar.
Issue-Abschlusskommentar und PR verlinken den abgeschlossenen Lauf des finalen
Commits. Der erste erweiterte
[CI-Nachweis](https://github.com/levtos/core_contract_app/actions/runs/37688023298)
enthält 85 Backendtests, PG-Dump/Restore und den Container-Lifecycle-Smoke;
danach wurde der Test für geheimnisfreie Fehlerausgabe beim Start ergänzt.

| Prüfung | Befehl / Ergebnis |
|---|---|
| Backend lokal | `uv run pytest -q` · **81 passed, 5 skipped: environment** |
| Backend vollständig | **86 Testfälle**, davon fünf mit PostgreSQL/pg_dump; CI setzt TEST_DATABASE_DSN und PG_TEST_CONTAINER_ID |
| Ruff | `uv run ruff check .` · ohne Fehler |
| Format | `uv run ruff format --check .` · ohne Änderungen |
| Typen | `uv run mypy --strict src client/core_contracts_client` · 24 Quelldateien ohne Fehler |
| Frontend | `npm run check` · 0 Fehler/0 Warnungen; `npm test` · **3 passed**; `npm run build` erfolgreich |
| Abhängigkeiten | `npm audit --audit-level=high` · **0 vulnerabilities** |
| Wheels | `uv build --wheel`; `uv build --wheel --project client` · beide erfolgreich |
| Images | buildx für `linux/amd64` und `linux/arm64` · gebaut, kein Registry-Push |
| Container-Lifecycle | `uv run python dev/container_smoke.py core-contracts:smoke` · DB bei Start nicht erreichbar, non-root, Dateirechte, DB-Ausfall/Recovery, stabile ID, SIGTERM bestanden |
| Lokales App-Repository | `dev/stage_app.py` erfolgreich in ein neues Arbeitsverzeichnis ausgeführt |

Die Container-Smoke-Ressourcen sind isoliert und werden anschließend entfernt.
CI-Wheels und Image-Tarballs sind kurzlebige Workflow-Artefakte, keine Releases.

## Tests nicht ausführbar

- Lokal fehlen Docker/PostgreSQL: vier PostgreSQL-Tests und ein pg_dump/Restore-Test
  werden als `skipped: environment` gemeldet. Die CI führt sie aus.
- Kein realer HA-/Supervisor-Test, keine reale Installation oder Konfigurationsänderung.
- Kein visueller Browser-/UI-Smoke; Svelte/TypeScript, Frontendtests und Build sind geprüft.
- Auf arm64 wurde das Image gebaut; der Lifecycle-Smoke läuft auf amd64.

## Build-Time Verification offen

Die [Checkliste](build-time-verification.md) trennt bestandene isolierte Checks von
Supervisor-Installation, Admin-WS-Rechten, realer state_reported-Last/Sendepuffern,
HA-Restart/Bridge-Reload, Ingress/UI, Services-MQTT, internem App-Hostname,
Supervisor-Watchdog und einem konsistenten realen `/data`-/PG-Backup.
Diese Nachweise und das unabhängige Opus-Review bleiben offen.

## Bekannte Alpha-Limits

- History-Retention/Partitionierung und große Historiendaten sind vertagt. Der
  Prozess hält den aktuellen Stand und die geladenen Historien im Speicher.
- Die Admin-UI arbeitet mit JSON-Drafts und Diagnoseansichten. Visuelle Abnahme offen.
- Die Thin Bridge wurde gegen die dokumentierte HA-API gebaut und über Fake-HA
  geprüft; reale HA-Berechtigungen und Lifecycle-Nachweise bleiben offen.
- Kein automatisches Phase-2-Gate und keine Freigabe für produktive Domain-Contracts.

## Migration / Installationshinweise

Eigene App und DB, separate Bridge, neue Installation-ID und Tokens. Bestehende
Integrationen und Consumer bleiben unverändert. App-Staging und konsistentes
`/data`-/PG-Backup sind in [Operations](../operations.md) beschrieben.
Kein Merge, Release, Tag oder Deployment ist Bestandteil dieses Abschlusses.

## Abweichungen von der Spezifikation

Einzeln begründet in [deviations.md](deviations.md): lokaler Supervisor-Build-Kontext,
aktualisiertes Testwerkzeug, technisch unvermeidliche Suchbegriffe und JSONB-
Tabellenlayout. Keine neue fachliche Semantik.

## Scope-Selbstcheck

Die Volltextsuche mit `rg -n -i` über das gesamte versionierte Repository umfasste
beide vollständigen Suchlisten aus §8 des Build-Prompts. Treffer sind Doku,
negative Validierungs-/Scope-Tests oder dokumentierte technische Ausnahmen:
Clock/Transport-`sleep`, Envelope-`published_at`, `pg_stat_activity`, CSS-`@media`,
Lucide-`Activity` und `lightningcss`-Paketmetadaten. Kein Treffer implementiert Domain-Logik.

Registriert sind ausschließlich `test.echo`, `test.boolean`, `test.fusion`,
`test.temporal`, `test.state_machine`, jeweils `fixture:true`; Producer-Code liegt
unter `testing/`. Der Scope-Wächter ist grün. Verbotene Registry-Felder werden
abgewiesen. Keine Consumer-/Policy-Migration und keine Legacy-Änderung.
