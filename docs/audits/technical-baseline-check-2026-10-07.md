# Core Contracts — Technischer Plausibilitätscheck der V1-Baseline (2026-10-07)

> **Hinweis (Platform-Korrektur 2026-10-07):** Verweise auf die „Alpha-1-Build-Spezifikation“ meinen die inzwischen superseded Fassung. Die hier geprüften Inhalte gelten unverändert in der Platform-Alpha-1-Spezifikation (`docs/platform-alpha1/build-specification.md`) fort.

**Ergebnis:** `TECHNICAL BASELINE CONFIRMED` (ohne Architekturänderung, mit Präzisierungen vor dem Build)
**Status:** Die Präzisierungen sind in die Alpha-1-Build-Spezifikation (`build-specification.md`,
§12–§25) übernommen. Dieses Dokument ist der Prüfnachweis.
**Spätere Fortschreibung:** Den DB-Standort (ursprünglich „standortlokal“ empfohlen) hat Benni als
Deployment-Konfiguration festgelegt. Eine WAN-Kopplung wird bewusst akzeptiert (Spezifikation §12.1).
Core-Profile wurden danach entfernt (siehe `profile-delta-audit-2026-10-07.md`).

Grundlage: fachliche Entscheidungsakte (Phase 4 · Auditrevision bis P4-65), HA-Quellcode
`home-assistant/core` (Branch `dev`, `core.py`, `websocket_api/commands.py`), Entwicklerdokumentation
zu HA-Apps (Konfiguration und Kommunikation) sowie PyPI. Alles geprüft am 2026-10-07.

## A. Gesamturteil

`TECHNICAL BASELINE CONFIRMED`. Kein fundamentaler Widerspruch. Sechs Präzisierungen vor dem Build (C1–C6).

## B. Unverändert übernommen

| Bereich | Urteil | Begründung |
|---|---|---|
| Supervisor-App, eigener Container, Compose nur Dev/Test | ✅ | Passt zu APP-01/M18-16. Ein HA-Core-Neustart beendet die App nicht. |
| Ein Prozess, `asyncio`, serialisierte Fortschreibung | ✅ | Die Domäne ist überwiegend synchron. Ein Writer liefert CP-08/F-23 und Commit-before-publish praktisch frei. |
| Pydantic v2 | ✅ | An Wire-, Config- und Registry-Grenzen; im Domainkern dürfen Frozen-Dataclasses bleiben. |
| PostgreSQL + `asyncpg`, kein ORM | ✅ | JSONB-Revisionen und OCC passen. Kein Rückgriff auf private `asyncpg`-Interna; TLS über `ssl=SSLContext`. |
| HTTP/JSON + WebSocket über eine `aiohttp`-Oberfläche | ✅ | Minimal; kein MQTT-Contract-Bus. |
| MQTT nur native Quellen und technische Funktionen | ✅ | – |
| `pyproject.toml`, `uv.lock`, Ruff, mypy, pytest | ✅ | Zusätzlich direkte Zeitzugriffe per Ruff verbieten. |
| Multi-Arch amd64/aarch64 | ✅ | Das sind genau die verbleibenden Supervisor-Architekturen. |
| Kein Privileged, kein Docker-Socket, kein Host-Netzwerk | ✅ | – |
| Strukturierte Logs, Health/Readiness | ✅ | Mit C3. |
| Explizite Migrationen | ✅ | Mit C5. |
| Eine App je HA-Installation | ✅ | Entspricht CL-F1. |
| Supervisor-Backup + separates PG-Backup | ✅ | Mit C4. |

## C. Präzisierungen vor dem Build (alle ohne Architekturänderung)

- **C1 HA-I/O-Grenze:** Entscheidung für Supervisor-App + Thin HA I/O Bridge (siehe D).
- **C2 DB-Ausfall und Commit-before-publish:** keine neue Revision ohne Commit; Readiness
  `persistence_unavailable`; Consumer sehen „nicht bestätigt“ (M17-08, APP-01 Punkt 1). Ingest hält nur
  die letzte Rohbeobachtung je Quelle. Nach Recovery gibt es eine Neuauswertung über Restore-Regeln, und
  die Historienlücke bleibt sichtbar (CP-15 §10).
- **C3 Watchdog = Liveness:** `/health/live` für Watchdog und Healthcheck, `/health/ready` nur für
  Diagnose. Sonst werden Wiederanbindungen bei DB- oder HA-Ausfall zu künstlichen Restore-Fällen.
- **C4 DB-Isolation:** DB und Rolle je Installation, Identitäts- und Schemaprüfung beim Start; ein
  PG-Restore ist ein CP-15-Fall; das Supervisor-Backup enthält die DB nicht. (Standort: siehe
  Fortschreibung oben.)
- **C5 Migrationen und Rollback:** nur vorwärts; ein neueres Schema führt zur Startverweigerung;
  Expand/Contract.
- **C6 Secrets und Non-Root im realen Supervisor-Modell:** keine Docker-Secrets. App-Optionen vom Typ
  `password`; MQTT über die Services-API (`hassio_api` dafür nicht nötig); `SUPERVISOR_TOKEN` nur aus
  der Umgebung; installationsgebundene API-Tokens; Rechteabgabe nach Init, weil `/data` root gehört;
  `hassio_api: false`.

## D. HA-I/O-Entscheidung: `SUPERVISOR APP + THIN HA I/O BRIDGE`

| Frage | Befund |
|---|---|
| Lässt sich `state_reported` über die öffentliche WS-API abonnieren? | **Nein.** `EventBus.async_listen` verlangt für `state_reported` einen Event-Filter („Event filter is required for event state_reported“); `subscribe_events` reicht keinen durch. Außerdem steht `state_reported` in `EVENTS_EXCLUDED_FROM_MATCH_ALL`. |
| Liefert `subscribe_entities` `last_reported`? | **Nein.** Es hört nur auf `state_changed`; das komprimierte Format enthält `s/a/c/lc/lu` ohne `last_reported`. |
| Lücke zwischen Snapshot und Abo? | `subscribe_entities` ist für `state_changed` lückenlos (kein `await` zwischen Snapshot und Listener). Reports fehlen. |
| Polling von `get_states` (enthält `last_reported`)? | technisch möglich, aber grob, lastintensiv und kein Event-Pfad → abgelehnt. |

**Folge:** Ohne Bridge sind M14-04 und P4-65 OS-G1 (Report-/Heartbeat-Evidence) nicht erfüllbar.

**Minimaler Bridge-Vertrag:** HA-Custom-Integration ohne Entities, Services, Timer und Speicher.
Sie registriert nur HA-WebSocket-Kommandos (`info`, `subscribe(entity_ids)`). Erste Nachricht ist ein
Snapshot mit vollständigem `State.as_dict` (inkl. `last_reported`; absent explizit), danach `changed`
und `reported` in Event-Bus-Reihenfolge. Snapshot und Listener-Registrierung erfolgen im selben Callback
ohne `await`. Verboten sind Normalisierung, Quality, Freshness, Grace, Fusion, Temporal, Ableitung und
Puffern. Fehlt die Bridge oder ist sie inkompatibel, gibt es eine sichtbare Diagnose und keinen stillen
Rückfall.

## E. Build-Time Verification

Python-3.14-Kompatibilität (`asyncpg` 0.32 deklariert 3.14; `aiomqtt` 2.5.1 deklariert bis 3.13, reines
Python), Wheels für amd64/aarch64, Supervisor-Build mit explizitem `FROM` (kein `BUILD_FROM` mehr seit
Supervisor 2026.04, `build.yaml` veraltet), Non-Root auf `/data`, Admin-WS-Rechte des Supervisor-Users
für Bridge-Kommandos, Last durch `state_reported`, Reconnect-Verhalten, Writer-Lock, DB-Ausfall,
Backup/Restore, Watchdog nur Liveness, DST-Tests, Consumer-Resync.

## F. Technischer Delta

Siehe Alpha-1-Build-Spezifikation, DOCUMENTATION DELTA DD-6.
