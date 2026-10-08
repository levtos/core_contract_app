# Platform Alpha 1 — Abschlussbericht nach Pre-Install-Remediation

Tracking: [Issue #1](https://github.com/Levtos/core_contract_app/issues/1),
[PR #2](https://github.com/Levtos/core_contract_app/pull/2), Branch `agent/platform-alpha1`.
Status höchstens **Testing / Tests Pass**. Release, Tag und Installation sind nicht freigegeben.
Benni hat am 08.10.2026 den Merge nach `main` ausdrücklich autorisiert, sobald Befunde,
Pflichtkorrekturen, Dokumentation und finale CI abgeschlossen sind und der Merge kein
automatisches HA-Deployment auslöst. Der Merge ist keine endgültige Phase-1-Abnahme.
Dieser Bericht ersetzt die überbewerteten Test-/Gate-Aussagen des ursprünglichen Builds.

## Ergebnis der unabhängigen Gegenprüfung

Alle **32 Befunde und acht Notes** wurden einzeln geprüft. 28 Befunde sind CONFIRMED;
OPUS-A1-013, -017, -020 und -021 sind PARTIALLY CONFIRMED. Keine vollständige
Zurückweisung und kein Befund wurde ersatzweise auf einen echten HA-Test vertagt.
Die konkreten Gegenbeweise zu Teilbehauptungen und sämtliche Ursachen, Dateien,
Commitreferenzen, Regressionstests und Restrisiken stehen in
[opus-remediation.md](opus-remediation.md). Der vollständige ursprüngliche Bericht
ist als unveränderte [Quellenkopie](opus-pre-install-review.md) enthalten.

Beide BLOCKER, alle bestätigten HIGH- und MEDIUM-Fehler und die unmittelbaren
Sicherheits-/Integritäts-/Clientprobleme der LOW-Befunde sind korrigiert. Es gibt
keine pauschale Vertagung von MEDIUM-Befunden. Verbleibende Alpha-Limits sind unten
und pro Befund begründet.

## Technische Korrekturen

- Runtime hält aktuelle Tabellen und ausstehende Changesets; historische Zustände
  werden weder vollständig geladen noch pro Tick tief kopiert. Fällige Timer und
  echte Evidence-/Quality-Änderungen erzeugen Publikationen, identische Idle-Zustände
  erzeugen weder neue History noch Commits. PostgreSQL bedient begrenzte, geordnete
  History-Abfragen über den Lesepool.
- Bridge verarbeitet das tatsächliche HA-Feld `last_reported`, filtert Reports nach
  Freshness/Liveness und verwaltet Subscriptions beim Unsubscribe/Unload. Negative
  restored-/unavailable-Evidence wird unabhängig von positiver Neuheit verarbeitet.
- Connection-Gaps entstehen beim Zustandswechsel und invalidieren nur abhängige
  Kontinuität. Grace startet nicht aus veralteter Evidence neu. Restore erhält nur
  nachgewiesene Zeitanker beziehungsweise bereits laufende Restfristen; kompatible
  Edge-Baselines und absolute Deadlines bleiben erhalten.
- Overflow wird als eigene Transaktion committed. Kontrollaufrufe, Commitfehler
  und erneuter Overflow während des Commits verlieren keine Gap-Markierung.
  Die synthetische State Machine kann mit frischer Live-Evidence nach unbrauchbarem
  Kontext neu initialisieren; unbestimmbare Guards bleiben konservativ unknown.
- Bootstrap-API und Signalziel bleiben durchgängig. DB-/HA-/MQTT-Fehler verwenden
  begrenzten Backoff; PostgreSQL besitzt serverseitige Connection-Timeouts.
  SIGTERM schließt offene WebSockets und schreibt den Marker nach Queue-Drain.
  DB-Rollback verwendet den bekannten Publication-Sequenz-Floor.
- Client resynchronisiert nach fehlerhaften Frames und Transportverlust; Auth-Fehler
  sind terminal. Administratoren erhalten sichere strukturierte Validierungsdetails.
  Auth-Versuche werden begrenzt; UI bestätigt Tokenrotation und Rollback.

## Tests und Nachweisarten

Die Prüfkette ist in [ci.yml](../../.github/workflows/ci.yml) festgelegt. Der
[vollständig grüne C3-Lauf](https://github.com/levtos/core_contract_app/actions/runs/37747814441)
prüfte `f77bcd4cadca599dc30c2505206ec0711e69b093`: 141 Backend-/PG-/MQTT-Tests bestanden,
ein HA-Test dort ausgelassen und im separaten echten HA-Kernel-Job bestanden;
Frontend, beide Wheels, beide Images, amd64-Smoke und Audits ebenfalls grün.
Danach wurden drei zusätzliche Regressionen für Commit-Konkurrenz und Shutdown-Marker
ergänzt. **Der unveränderliche Abschlusskommentar in PR #2 nennt den endgültigen
PR-Head und dessen vollständig abgeschlossenen CI-Lauf.** Nur dieser Nachweis ist
maßgeblich für G14 am finalen Stand.

| Prüfung | Umfang / tatsächlich vorhandener Nachweis |
|---|---|
| Backend lokal | **137 passed, 8 skipped: environment**; insgesamt 145 Testfälle. Acht lokale Skips: sechs PostgreSQL, ein Docker-MQTT, ein HA-Kernel. |
| Ruff / Format | `uv run ruff check .`, `uv run ruff format --check .`; Original-Reviewkopie vom Formatter ausgenommen, damit deren Codeblöcke unverändert bleiben. |
| Typen | `uv run mypy --strict src client/core_contracts_client`; 24 Quelldateien fehlerfrei. Bridge nicht als vollständiger HA-strict-Verbund ausgegeben. |
| PostgreSQL | SQL-Migration, Writer-Lock, Commitfehler, aktuelle statt vollständiger historischer Load, begrenzte sortierte History, pg_dump/Restore in isolierten DBs. |
| MQTT | Echter wegwerfbarer Mosquitto-Container: anonyme Verbindung, Nachricht, ungültige Payload, Stop/Start und Reconnect. |
| HA-Kernel | Home Assistant **2026.10.0**, echter State-Engine, Event-Helper und Bridge-Callback; 100 Subscribe/Unsubscribe-Zyklen und Unload. |
| Client / API | Echte lokale aiohttp-HTTP-/WS-Verbindungen: Auth, Resync, fehlerhafte Frames, verlorene Command-Antwort, offener Socket beim Shutdown. |
| Restore / Ressourcen | FakeClock/MemoryStore: Grace, since_at, stable_for, Deadlines, SM-Reinitialisierung, QueueFull, laufender Commit, 10.000-Tick-Soak. |
| Frontend | Svelte/TypeScript: 0 Fehler/0 Warnungen; **4 Tests**, Produktionsbuild; kein visueller Browser-Smoke. |
| Python-Wheels | `uv build --wheel` und `uv build --wheel --project client`. |
| Images | amd64 und arm64 gebaut; kein Registry-Push. Lifecycle-Smoke ausschließlich amd64. |
| Isolierter Container | DB fehlt beim Start, UID 10001, Token 0600, DB-Restart, tatsächliche Netzwerkpartition/Writer-Lock-Freigabe, Recovery und SIGTERM mit offenem WS. |
| Dependencies | `pip-audit==2.9.0 --strict --no-deps --disable-pip` gegen exportierten frozen Runtime-Lock; `npm audit --audit-level=high`. C3: keine bekannten Python-Schwachstellen, 0 npm vulnerabilities. |

Die CI-Ressourcen sind isoliert und werden entfernt. Wheels/Image-Tarballs sind
kurzlebige Workflow-Artefakte. Kein realer Supervisor-Nachweis wird aus diesen Tests
abgeleitet. Die Ressourcenprobe läuft zusätzlich reproduzierbar in CI.

## Ressourcenvergleich

Identischer isolierter Testpfad mit fünf Fixtures und 1.200 Ticks: vorher **6.005
History-Zeilen / 1.201 Publications**, nachher **6 / 2**. Die zweite Publication
arbeitet eine tatsächlich fällige Deadline ab. Danach bleibt der Zustand konstant.
Tick 1.200 sank in der Windows/FakeClock-Messung von **255,86 ms auf rund 0,02 ms**;
aktueller State ab Tick 100 konstant **10.847 Bytes**. Der Soak-Test prüft zusätzlich
10.000 Ticks mit unveränderter Generation und weniger als 100 kB zusätzlicher
tracemalloc-Belegung nach GC. Keine PostgreSQL-/HA-RSS- oder tagelange Realzeitmessung.
Messverfahren und Einzeldaten stehen in der Befundmatrix.

## Korrigierte G1–G15

| Gate | Status und Grenze |
|---|---|
| G1 | **PARTIAL**: beide Images und isolierter non-root-Start; Supervisor-Installation offen. |
| G2 | **PARTIAL**: echter HA-Kernel statt ausschließlich Fake-HA; reale Rechte, Last, installiertes Reload/Restart offen. |
| G3 | **PARTIAL**: Registry/API/OCC/UI-Build geprüft; realer Ingress und visuelle Administration offen. |
| G4 | **PASS, isoliert**: Installation-ID-Matrix, Initialisierung/Adoption und Mismatch-Schutz. |
| G5 | **PASS, isoliert**: PostgreSQL-Migration, Persistenz und Dump/Restore. |
| G6 | **PASS, isoliert**: korrigierte Grace-/Kontinuitäts-/Deadline-/SM-Restore-Nachweise. |
| G7 | **PASS, isoliert**: genau fünf synthetische Producer im vollständigen Pfad. |
| G8 | **PASS, isoliert**: CoreContractsClient, Snapshot/Delta/Resync, Commands und stabile IDs. |
| G9 | **PASS, isoliert**: Commit-before-publish, Freeze, Lock, Recovery, Partition und Sequenz-Floor. |
| G10 | **PARTIAL**: Startup-Liveness und Docker-SIGTERM; tatsächlicher Supervisor-Watchdog offen. |
| G11 | **PASS, isoliert**: korrigierte Evidence-/Quality-/Freshness-/Clock-Nachweise. |
| G12 | **PASS, isoliert**: Drafts, enabled/ever_active, Reaktivierung und Revision-Rollback. |
| G13 | **PASS**: nur fixture:true / test.*, keine Domain-/Consumer-/Legacy-Änderung. |
| G14 | **CI-gebunden**: PASS ausschließlich mit grüner vollständiger Prüfkette auf dem finalen PR-Head. |
| G15 | **PARTIAL**: Dokumentation vollständig; unabhängiger Opus-Delta-Review und menschliches Acceptance Gate offen. |

## Offene Risiken und Alpha-Limits

- Reale Supervisor-Installation, Admin-WS-Rechte, Ingress, HA-Last/Reload/Restart,
  Services-MQTT, Watchdog und konsistentes Betriebsbackup bleiben in der
  [Build-Time-Checkliste](build-time-verification.md) offen.
- Historie echter Änderungen wächst als Audit-Datenbestand; Retention/Partitionierung
  ist gemäß Spezifikation §29 vertagt. Der Prozess lädt diese Historie nicht mehr.
- Gemeinsame Role-Tokens hinter derselben IP teilen ein HTTP-Budget; mehrfeldige
  produktive Schemas und SQL-Batching bei hoher WAN-Latenz sind spätere Aufgaben.
- JSON-Draft-UI ohne visuelle Abnahme; Bridge noch ohne vollständige HA-strict-Typprüfung.
  arm64 besitzt einen Build-Nachweis, keinen Laufzeit-Smoke.
- Ein älteres DB-/data-Paar kann eine extern bereits beobachtete, nirgendwo mehr
  gespeicherte Sequenz nicht rekonstruieren. Konsistentes Backup bleibt erforderlich.

## Wiederverwendung, Abweichungen und Scope

[reuse-analysis.md](reuse-analysis.md) dokumentiert KEEP/ADAPT/REMOVE/REVIEW;
[deviations.md](deviations.md) enthält die ursprünglichen begründeten Build-Abweichungen.
Das Legacy-Repository `Levtos/core-contracts` wurde nicht verändert. Registriert
sind ausschließlich `test.echo`, `test.boolean`, `test.fusion`, `test.temporal` und
`test.state_machine`; Producer-Code liegt unter `testing/`. Scope-/Registry-Wächter
bleiben verbindlich. Keine Consumer-/Policy-Migration, Core-Profile, Shadow-Modi oder
Phase 2. Registry/Bindings mit stabilen IDs, Supervisor-App + Thin HA I/O Bridge,
PostgreSQL, Commit-before-publish und CoreContractsClient bleiben unverändert gültig.

Der nächste Schritt ist der unabhängige **Opus-Delta-Review** gegen `db85981` und den
finalen PR-Head, gegebenenfalls nach dem autorisierten Merge. Neue Befunde werden dann
über einen Folge-PR korrigiert. Der PR-Abschlusskommentar dokumentiert den geprüften
Head, die CI, die Deployment-Prüfung und gegebenenfalls den tatsächlichen Merge-Commit.
Auch der Delta-Review ersetzt keine ausdrücklich autorisierte reale Supervisor-Abnahme
und keine separate Installations-/Live-Freigabe.

Die Deployment-Prüfung am 08.10.2026 ergab genau einen registrierten Workflow:
`Platform Alpha 1`. Dieser reagiert auf PRs und Pushes des Arbeitsbranches, besitzt
keinen Push-Trigger für `main`, baut Images mit `push: false` und veröffentlicht
nur CI-Artefakte. GitHub meldet keine Deployments und keine Environments. Das
Lesen von Repository-Webhooks ist für `levtos-codex` mangels `admin:repo_hook`
nicht möglich; Benni hat ausdrücklich bestätigt, dass **keine externe HA-
Deployautomation eingerichtet ist**. Damit ist die Deployment-Voraussetzung für
den autorisierten Merge geklärt, ohne eine produktive HA-Instanz zu verändern.
