# Issue #3 — Pre-Install Delta-Korrekturen

Verbindlicher Umfang: [Issue #3](https://github.com/Levtos/core_contract_app/issues/3),
einschließlich [Opus-Delta-Review](https://github.com/Levtos/core_contract_app/issues/3#issuecomment-6056965432)
und [Reproduktionsskript](https://github.com/Levtos/core_contract_app/issues/3#issuecomment-6056967340).
Ausgangsbasis ist main bei `0d38ae2cf9b0bfa6f7dcf5e8463a20f1cdbc03b7`.
Implementierung: `agent:codex`, Branch `agent/issue-3-delta-fixes`.
Die Platform-Alpha-1-Build-Spezifikation bleibt unverändert.

## Ist, Korrektur und Nachweis

| Befund | Eigenständig reproduzierter Ist | Korrektur / Pflichtnachweis |
|---|---|---|
| DR-01 | Unverändertes D1: 1.200 Ticks erzeugen +1.200 History-Zeilen und +1.200 Publications. | Kein periodischer age-Termin. Die Fixture hält ihren abgetasteten Wert bei identischer Input-Evidence auch bei fremden Timern und Clock-Sprüngen fest. D1 danach +0/+0. |
| DR-02 | Echtes QueueFull: ältere unavailable-Observation überschreibt nach Drain die neuere available-Observation. Auch der Gegenfall überschreibt neuere negative Evidence. | Vergleich der Messzeiten vor Neuheits-/Quality-Ausnahmen, ebenfalls bei Snapshots, Overflow-Drain und DB-Recovery. D2 danach available, Messzeit 12:00:02, Feld valid. |
| DR-03 | Broker-/DB-Ausfall vor dem nächsten Probe lässt PersistenceUnavailable aus MQTTAdapter.run entweichen. | Status-Commit wird im Processor abgefangen; Statusmeldung im Adapter-Fehlerpfad separat geschützt. Backoff läuft weiter. Kein Delta/History/Sequenzfortschritt bei fehlgeschlagenem Commit; Recovery stellt Persistenz mit neuer Epoche und Gap wieder her. |
| DR-05 | auth:{ip} wird vor der Tokenprüfung für alle nicht-Health-Anfragen auf dem Bearer-Listener belastet. | Operations und App-DOCS beschreiben das gemeinsame 120/min/IP-Budget über alle Rollen plus das zusätzliche Budget je IP/Rolle. Ingress ist gesondert beschrieben. Kein Limiter-Umbau. |
| DR-06 | Der Writer setzt idle_session_timeout beim Connect. | PostgreSQL >=14, DDL-/DML-Rechte und die benötigten Session-Settings sind in beiden Betriebsdokumenten aufgeführt; Probe-/Idle-Abhängigkeit erläutert. Keine zusätzliche Startdiagnose. |

Die erste Fassung der neuen Regressionstests ergab am unveränderten Produktcode
**12 failed, 23 passed**. Beim Selbstreview bestätigten neun weitere Fälle die
DR-02-Lücke bei Snapshots und gepufferten Werten; sie sind ebenfalls korrigiert.
Die endgültige neue Delta-Suite umfasst **46 Tests**.

## Präzisierung der bestehenden Plattformpfade

- `age` bleibt ein aus `measured_at` abgeleiteter numerischer Wert. Der
  publizierte Wert ist eine Abtastung bei geänderter Evidence, kein laufender
  Zähler. Der Cache liegt im vorhandenen Node-State und folgt dessen
  Fingerprint-/Restore-Lifecycle. Ungültige Evidence verwirft die Abtastung.
  Freshness- und Held-Ablauf werden weiterhin ausgewertet.
- Vergleichbare Messzeiten sind maßgeblich, unabhängig von Wert, Availability
  oder negativen Flags. Gleiche Messzeit blockiert einen negativen Wechsel
  nicht. Fehlende Messzeit beweist keine Reihenfolge: Negative Evidence bleibt
  konservativ wirksam; Empfangszeit wird nicht als Messzeit eingesetzt.
- Ein fehlgeschlagener MQTT-Status-Commit verändert den letzten bestätigten
  Contract-Stand nicht. Service-State meldet den Ausfall; Liveness bleibt grün,
  Readiness rot. Recovery verlangt weiterhin einen frischen Snapshot.
- Einmalige echte Zustandswechsel bleiben erlaubt: Freshness-Ablauf, Grace-Ende,
  Rücksetzen einer aktiven Edge und neue Heartbeat-Evidence. D5 bleibt deshalb
  unverändert bei +100 History-Zeilen/+100 Publications für 100 neue Reports.

## Tests und Ressourcen

Lokal mit dem eingefrorenen Lockfile und Python 3.14 ausgeführt:

| Prüfung | Ergebnis |
|---|---|
| `uv run pytest -q` | **187 passed, 8 skipped** |
| `uv run ruff check .` | bestanden |
| `uv run ruff format --check .` | bestanden |
| `uv run mypy --strict src client/core_contracts_client` | bestanden, 24 Quelldateien |
| `git diff --check` | bestanden |
| Unverändertes Issue-Repro-Skript | R1–R10 unverändert korrekt; D1–D3 korrigiert; D4/D5 unverändert |
| Erweiterte Idle-Soaks | Echo, age, edge, grace, report_heartbeat: je 10.100 Ticks, keine zusätzlichen Commits/History/Publications, begrenzter In-Memory-Zustand |
| `uv run python dev/resource_probe.py` | 8 Fixtures, nach explizitem Warmup 1.200 Ticks: +0 History, +0 Publications; aktueller Zustand unverändert |

Die lokalen Skips sind umgebungsbedingt: ein HA-Kerneltest, sechs PostgreSQL-/
Backup-Tests und ein Docker-Mosquitto-Test. Diese laufen in der bestehenden
GitHub-CI. Die Workflow-Datei bleibt unverändert: Platform inklusive PostgreSQL,
Mosquitto, Security-Audit und Wheels; Frontend-Check/Tests/Build/Audit;
HA-Bridge-Kernel; amd64- und arm64-Image; Container-Lifecycle-/Partitions-Smoke.
Verbindliche serverseitige Ergebnisse sind die Checks am finalen PR-Head und
der Abschlussnachweis in Issue #3; lokale Skips werden nicht als bestanden gezählt.

## Technischer Selbstreview

Gezielt geprüft wurden die geänderten Pfade und ihre direkten Nachbarn:

- Scheduler und globale Auswertung: age bleibt bei fremdem stable_for-Termin
  und Rückwärtssprung unverändert; neue Evidence liefert einen neuen Messwert.
  Freshness-Ablauf bleibt einmalig, neue Reports reaktivieren den Wert.
- Node-State: Restart degradiert restaurierte Evidence; ein frischer Snapshot
  und ein geänderter Fingerprint erzeugen eine neue Abtastung.
- Temporal: Edge wird einmal zurückgesetzt; Grace endet einmal. Anschließende
  Idle-Ticks erzeugen keine weiteren Archivzeilen. Bestehende Restore-Tests
  sichern Anker, Grace-Restzeit und SM-Deadlines.
- Reihenfolge: sieben negative Flags, echte QueueFull-Fälle, Snapshot-Queue,
  beide Vorzeichenrichtungen, gleiche/neue/fehlende Messzeit sowie
  Overflow-/DB-Recovery. Alte Eingänge schreiben keine neue Source-History.
- Fehlergrenzen: Processor-Statuspfad und Adapter-Statusmeldung getrennt
  getestet; echter TaskGroup-Kontext, HTTP-Liveness/Readiness, Retry-Backoff,
  unveränderte Publication bei Commitfehler und erfolgreiche Recovery.
  Cancellation bleibt außerhalb der Exception-Handler und beendet den Task.

Keine weiteren Korrekturen sind aus diesem gezielten Selbstreview offen.
Er ersetzt nicht den im Issue vorgesehenen kurzen unabhängigen Opus-Re-Review.

## Verbleibende Risiken und Gates

| Befund / Gate | Stand |
|---|---|
| DR-04 | Unverändert: Nach Restore armiert ein Snapshot allein keine neue Grace; konservativer Verlust möglicher Grace. |
| DR-07 | Unverändert: Während DB-Rollback-Recovery kann kurzzeitig ein gemischter, unbestätigter Snapshot sichtbar sein. |
| DR-08 | Unverändert: SIGTERM sendet going_away vor Drain/Commit; letzte Drain-Publications erreichen die geschlossenen Subscriber nicht. |
| DR-09 | Unverändert: Unbekannte Registry-Revision liefert 200/null. |
| DR-10 | Unverändert: ungenutzte Runtime-Operation gap. |
| DR-11 | Unverändert: History wächst mit echten Reports; Retention/Partitionierung bleibt vertagt. |
| DR-12 | Pflichtlücken DR-01–03 geschlossen. Gestagter Supervisor-Build-Kontext weiterhin nicht als eigener CI-Build abgedeckt. |
| Re-Review | Kurzer unabhängiger Opus-Re-Review der geänderten Pfade bleibt ein getrenntes Abnahme-Gate. |
| Reale G1/G2/G3/G10/G15 | Supervisor, echte HA-Bridge-Rechte/Reports, Ingress und menschliche Abnahme bleiben offen. |

Status höchstens **Testing / Tests Pass** nach grüner CI. Kein Release, kein Tag,
keine HA-Installation, keine Policy-/Consumer-Migration und keine Änderung am
Legacy-Repository. Eine Installation benötigt Bennis gesonderten Auftrag.
