# Codex-Auftrag: Core Contracts — Platform Alpha 1 (Phase 1 · Platform Foundation)

Du bist **Codex** und baust die **generische Core-Contracts-Plattform**. Dies ist ein Bauauftrag:
Dateien anlegen, implementieren, Tests schreiben und ausführen, Images bauen, Fehler beheben.
Frage nicht nach jedem Schritt nach Bestätigung.

> **Scope-Regel Nr. 1:** Du baust **keine** realen fachlichen Contracts und migrierst **keine** Consumer.
> Keine Logik für Öffnungen/Fenster/Türen, Anwesenheit, Bio/Schlaf, Aktivität/Gaming, Medien,
> Klima/Heizung, Beschattung/Safety, Licht, Tagesphase, Weckplanung, Simulation, Plug- oder Door-Policy,
> auch wenn die Fachakte sie beschreibt. Die Fachakte ist für dich eine **Capability-Anforderung**:
> Sie sagt, welche generischen Werkzeuge die Plattform braucht. Sie ist kein Auftrag, Domänen zu
> programmieren. Bewiesen wird die Plattform mit synthetischen `test.*`-Contracts.

## 1. Autorität

1. **Primäre Build-Quelle:** `docs/platform-alpha1/build-specification.md` im Repo
   `Levtos/core_contract_app` („Spezifikation“).
2. **Rückfallquelle für generische Semantik** (Status, Held, Grace, Restore, Fusion, SM, Temporal):
   `D:\Dokumente\Core-Contracts-Konsolidierung\final\Core_Contracts_Master_Entscheidungsakte_Phase4_Auditrevision.md`
   (lokal, privat; **nie** ins Repo kopieren).
3. **SUPERSEDED, nicht ausführen:** `Levtos/core-contracts/docs/alpha1/build-specification.md` und
   `…/codex-build-prompt.md` (vermischten Phase 1 und 2). Issue `Levtos/core-contracts#46` ist
   deshalb geschlossen.

## 2. Governance

- Lies `AGENTS.md` (falls vorhanden) und
  [Levtos/control/docs/](https://github.com/Levtos/control/tree/main/docs) inkl. ADR 0002
  (`Levtos/control#21`). Für die Admin-UI zusätzlich ADR 0001 (`Levtos/control#17`). Nutze CTX zuerst,
  falls verfügbar.
- Arbeite unter genau einem Issue in `Levtos/core_contract_app`:
  **`<ISSUE-URL — von Benni einzutragen>`**. Fehlt es, lege es an: Titel
  „Platform Alpha 1 — Phase 1 Platform Foundation“, oben ein Abschnitt **„Aktueller verbindlicher
  Vertrag“** mit Link zur Spezifikation und Agent-Kennzeichnung `agent:codex` (Label `owner/codex`,
  ggf. anlegen).
- Frischer Clone von `main`, Branch `agent/platform-alpha1`, ein PR. Kein Release, kein Tag, keine
  Installation auf einer echten HA-Instanz. **Live und Live Verified sind Bennis Gate.**
- `Levtos/core-contracts` (Legacy-Integration, live genutzt von `blind_control`) wird **nicht** verändert.
  Es dient nur als Quelle für die Wiederverwendungsanalyse.
- Keine privaten Daten, Secrets, IPs, Hostnamen oder Infrastruktur-Topologie in Repo, Issue, Commits,
  Logs oder Fixtures. Platzhalter wie `sensor.example_1` verwenden.

## 3. Unveränderbar (nicht neu designen)

Ownership Core/Policy/Apply · fünf Status (`valid`, `held`, `unknown`, `not_applicable`, `unresolved`)
mit Reason-Pflicht · Held-Propagation ohne Grace-Ketten · Freshness-/Evidence-Regeln ·
bausteinspezifischer Restore · Registry-Modell mit stabilen IDs · **kein Shadow-Modus** ·
**keine Core-Profile** · `installation_id` · Supervisor-App + Thin HA I/O Bridge · Commit-before-publish ·
Watchdog nur an Liveness · `CoreContractsClient` + HTTP/WS.

Lokale, reversible technische Detailentscheidungen darfst du treffen. Bei einem echten Widerspruch:
in `docs/platform-alpha1/deviations.md` und im Issue dokumentieren, die konservativste Variante ohne neue
Semantik bauen und weiterarbeiten.

**Verboten:**
- `profile`/`profile_id`, Default `benni`, `consumer_ids`, Shadow/Published-Modi.
- `set_state`, `safe_default`/`hold_last`, freie Ausdrücke.
- MQTT als Contract-Bus, Fachlogik in der Bridge, DB-Zugriff für Consumer.
- Publish vor Commit, Watchdog an Readiness, private `asyncpg`-Interna.
- privileged, Docker-Socket, `hassio_api: true`, `build.yaml`, Dependency-Auflösung beim Start.
- **Jeder Contract-Typ außerhalb von `test.*`.**

## 4. Phase A — Bestand und frühere Arbeit prüfen

Schreibe `docs/platform-alpha1/reuse-analysis.md` mit vier Kategorien:

| Kategorie | Bedeutung |
|---|---|
| **KEEP** | generische Plattform, passt zur Spezifikation |
| **ADAPT** | generisch, aber zu korrigieren (z. B. Profil-Felder entfernen, auf fünf Status umstellen) |
| **REMOVE/REVERT FROM ALPHA1** | domänenspezifisch (Contract-Regeln, Zustandsautomaten realer Domänen, Policy-Regeln, Consumer-Migration) |
| **REVIEW** | unklar → begründen, im Zweifel nicht übernehmen |

Zu prüfen:

1. **Frühere Arbeit unter dem superseded Auftrag** (`Levtos/core-contracts#46`, Branch
   `agent/alpha1-build` oder lokale Reste, falls vorhanden): **nicht** automatisch übernehmen, **nicht**
   pauschal verwerfen. Generische Teile (SM-Framework, Resolver-Interface, Quality-Typen,
   Evidence-Strukturen, Registry, Temporal-Bausteine, Persistenz, API, Bridge) einzeln klassifizieren
   und nur KEEP/ADAPT übernehmen. Domänenteile (z. B. eine Öffnungs-Fusion, eine Anwesenheits- oder
   Schlaf-SM, Aktivitäts-Mappings, Klima-Sperren) **nicht** übernehmen.
2. **Legacy `Levtos/core-contracts`** (`custom_components/benni_core_contracts/*`, `migrations/`, `tests/`,
   `frontend/`). Faustregeln:
   - ADAPT: Graph-, Quality-, Freshness-, Fusion-Kern (ohne `opening_*`), Registry-Revisionen/OCC,
     kanonische Serialisierung und Checksumme, reine Observation-Normalisierung, brauchbare
     generische Tests, Frontend-Toolchain.
   - REMOVE: `profiles.py` und `ProfileId`, `shadow*`, `published.py`, die Gate-Module, `consumer_ids`,
     `hass.data`-Consumer-Pfad, HA-Store-Restore, ConfigEntry-Lebenszyklus, Default `benni`,
     die domänenspezifischen v1-Schemas (`opening`, `presence`, `room_climate`,
     `weather_environment`, `technical_device`) und die `opening_*`-Fusion.

## 5. Phase B — Bauen (Reihenfolge)

1. **Repo-Struktur** gemäß Spezifikation §14.1, `pyproject.toml`/`uv.lock` (Python 3.14),
   Ruff/mypy/pytest, `repository.yaml`, `hacs.json` (Bridge), `dev/compose.yaml` (PostgreSQL), Fake-HA-Server.
2. **Kern:** Clock/FakeClock (§18), Observation/Evidence (§8), Status/Quality/Reasons inkl.
   Laufzeit-Invarianten (§7), Schema-Framework und Contract-Typ-Registry (§6.1–§6.3).
3. **Frameworks:** Resolver-Interface + generische Operatoren (§6.5), Fusion + Erweiterungspunkt (§6.6),
   SM-Framework mit Guards, Commands, Episoden, Deadlines, Sessions (§6.7), Temporal-Werkzeuge,
   Fingerprint (§9).
4. **Registry** (§10): Sources/Bindings/Contracts/Catalogs, Drafts, Validierung (alle Regeln),
   Aktivierung, Rollback, Import/Export, `enabled`.
5. **Persistenz** (§12): Migrationen und Runner, generische Tabellen, Writer-Lock,
   Commit-before-publish, DB-Ausfall und Recovery, `installation_id` (§11).
6. **Runtime** (§14.4/§14.5): supervisierte Tasks, serialisierter Processor, begrenzte Queues,
   Startup/Shutdown, Restore-Ablauf (§9.4), Revisionsaktivierung (§9.5).
7. **Adapter:** HA über die **Thin Bridge** (§13, inkl. Integration `core_contracts_bridge`), MQTT (§17),
   Scheduler. Optional ein generischer `request_refresh`.
8. **API und Client** (§15/§16): zwei Listener, alle Endpunkte, WS mit `prev_seq`/Resync, Commands mit
   Idempotenz, Tokens (§19), `CoreContractsClient`.
9. **Synthetische Testcontracts** (§6.8): `test.echo`, `test.boolean`, `test.fusion`, `test.temporal`,
   `test.state_machine` unter `src/core_contracts/testing/contract_types/`, als Fixture markiert.
   Dazu eine Beispiel-Registry `docs/platform-alpha1/example-registry.json` mit Platzhalter-Entities.
10. **Admin-UI** (§26) über Ingress: Status, Bridge/DB, Revisionen, Sources, Bindings,
    Draft/Validierung/Aktivierung/Rollback, Diagnostics, Testcontracts, Evidence-/Reason-Debugging.
11. **Packaging** (§14.2/§14.3): Multi-Stage, explizites `FROM`, non-root via Entrypoint, `config.yaml`,
    buildx für amd64/aarch64, Bridge HACS-fähig, Client-Wheel.
12. **Tests** (§28) vollständig, inkl. Scope-Wächter `test_no_domain_contract_types`.
13. **Vollständige Test- und Build-Runde**, Fehler beheben, wiederholen.
14. **Doku:** `docs/operations.md` (Installation, Bridge, Tokens, DB je Installation,
    Backup/Restore-Runbook), `docs/api.md`, `deviations.md`, README, CHANGELOG.

Committe in sinnvollen Einheiten mit Verweis auf Spezifikationsabschnitte. Führe die Tests nach jedem
größeren Schritt aus.

## 6. Qualität

- Ruff (inkl. `DTZ`/banned-api gegen direkte Zeitzugriffe) und mypy `--strict` für `src/` und `client/`
  ohne Fehler.
- Kein stummes `except`. Jeder `unknown` hat Reason und Input. Reasons stammen nur aus dem Katalog.
- Pydantic v2 an Grenzen; im Kern dürfen Dataclasses bleiben.
- Keine Ad-hoc-Timer, kein verstecktes Resolver-Gedächtnis.
- Keine vorgetäuschten Teile: Persistenz, Restore und Quality werden nicht vereinfacht. Was offen
  bleibt, ist ein Alpha-Limit und wird so berichtet.

## 7. Umgebung

- Fehlen Docker oder PostgreSQL, werden Integrationstests als „skipped: environment“ markiert und berichtet.
- Supervisor- und echte HA-Nachweise (§29) sind „Build-Time Verification offen“. Bereite dafür Skripte
  oder Checklisten vor.
- Scheitert eine Verifikation, zuerst technisch korrigieren; keine neue Semantik erfinden.

## 8. Selbstcheck vor dem PR (Pflicht)

1. Suche im gesamten Repo nach `opening`, `window`, `fenster`, `door`, `presence`, `bio`, `sleep`,
   `activity`, `gaming`, `media`, `climate`, `heating`, `blind`, `light`, `day_phase`, `wake`.
   Jedes Vorkommen MUSS sein: vertagte Domain-Logik (Doku), Herkunft einer Capability (Doku),
   Scope-Wächter-Test oder ein reines Source-ID-Beispiel ohne Logik. Alles andere entfernen.
2. Suche nach `profile`, `shadow`, `published`, `consumer_ids`, `set_state`, `benni`. Erlaubt nur in
   Verboten-/Validierungstests und in der Doku.
3. Prüfe, dass `test_no_domain_contract_types` grün ist und ausschließlich `test.*` registriert sind.

## 9. Abschluss

PR gegen `main` von `Levtos/core_contract_app` und ein Issue-Kommentar mit diesem Bericht. Board-Status
höchstens „Testing“/„Tests Pass“, **nicht Live**. Kein Merge-Zwang, keine Releases.

```
## Implementiert            (je Spezifikationsabschnitt; G1–G15 einzeln mit Nachweis)
## Wiederverwendet          (Bestandteil → KEEP/ADAPT, Herkunft)
## Entfernt / superseded    (REMOVE/REVERT FROM ALPHA1 mit Begründung; REVIEW-Fälle)
## Tests bestanden          (Suites, Anzahl, Befehle)
## Tests nicht ausführbar   (Fall → Grund)
## Build-Time Verification offen
## Bekannte Alpha-Limits
## Migration / Installationshinweise
## Abweichungen von der Spezifikation (einzeln, begründet)
## Scope-Selbstcheck        (Ergebnis von §8)
```

Danach folgen ein unabhängiger Opus-Review, die Prüfung der Befunde und deine Korrekturen. Phase 2
(Domain Contracts + Consumer-Migration) beginnt erst nach bestandenem Acceptance Gate (Spezifikation
§27) und **nicht** in diesem Auftrag.
