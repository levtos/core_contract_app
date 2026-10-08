# Opus Pre-Install Review — unveränderte Quellenkopie

Befunde des externen Reviews, keine normative Spezifikation. Eigene Gegenprüfung siehe opus-remediation.md. Die ursprünglichen GitHub-Kommentare bleiben unverändert.

Source: https://github.com/levtos/core_contract_app/pull/2#issuecomment-6054556193
Author: levtos-claude
Updated: 2026-10-08T07:09:03Z

> **Opus Pre-Install-Review · PR #2 · Teil 1/3** · Urteil **`READY FOR PRE-INSTALL REMEDIATION`** · Commit `db85981`
> Navigation: **Teil 1** Übersicht, Bereiche, G1–G15 · [Teil 2](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054558431) Findings OPUS-A1-001…032 + Notes · [Teil 3](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054558966) Positive Bestätigungen, Pre-Install-Fixes, Real-HA-Restpunkte, Urteil, Reproduktion

# Core Contracts Platform Alpha 1 — Unabhängiger Pre-Install-Review (Opus)

**Urteil: `READY FOR PRE-INSTALL REMEDIATION`** · Geprüfter Commit [`db85981`](https://github.com/Levtos/core_contract_app/commit/db85981d2c282b9d597a806fc07022e08f97c802)  
**Spätere Ablage im Repo:** `docs/platform-alpha1/opus-pre-install-review.md` (in diesem Review **nicht** committet)
**Reviewer:** Claude Opus 5.5 (unabhängig, read-only) · **Datum:** 2026-10-08
**Gegenstand:** [Levtos/core_contract_app PR #2](https://github.com/Levtos/core_contract_app/pull/2), Issue #1 (`agent:codex`)
**Art:** Review/Audit — keine Codeänderung, kein Commit, kein Merge, kein Deployment, keine Installation.

---

## Executive Summary

Die Implementierung trifft die **Architektur der Spezifikation** weitgehend korrekt: strikt nur
`test.*`-Fixtures, keine Profile/kein Shadow, geschlossene Registry-Modelle mit OCC, echter
Commit-before-publish mit Fehlerinjektion, exklusiver Writer-Lock mit Lock-Prüfung pro Commit,
geprüfte Migrationen, Identitätsmatrix, dünne Bridge ohne Fachlogik, getrennte Listener,
non-root-Container und eine ehrliche CI (86/86 grün auf dem geprüften Commit).

Vor einer realen Installation gibt es aber **zwei BLOCKER** und **drei HIGH-Befunde**, die durch
Codeanalyse und Reproduktion eindeutig belegt sind:

1. **OPUS-A1-001 (BLOCKER) — unbegrenztes Wachstum durch den 0,5-s-Tick.** Jeder Tick wertet alle
   Contracts neu aus, erzeugt **eine neue Publication und pro Contract eine History-Zeile**, klont
   dabei den **gesamten** Zustand inklusive aller Historie tief und diffed ihn vollständig gegen
   den letzten Commit. Reproduziert mit der Beispiel-Registry: Tick-Latenz steigt linear von
   3 ms auf **240 ms nach 10 Minuten** Laufzeit; RAM und DB wachsen um ~430 000 History-Zeilen
   und ~170 000 Publications pro Tag. Absehbare Folge auf HA: blockierter Event-Loop,
   Queue-Sättigung, Overflow-/Resubscribe-Schleifen, OOM, beim Neustart Volllast-Ladevorgang ohne
   Liveness-Listener → Watchdog-Restart-Schleife.
2. **OPUS-A1-002 (BLOCKER) — Bridge-`reported`-Pfad wirft auf echtem HA bei jedem Event.**
   `event.data["new_last_reported"]` existiert in HA nicht (verifiziert gegen
   `homeassistant/core.py`: `last_reported`, `old_last_reported`, `new_state`). Folge: kein
   einziger `state_reported` erreicht die App (Hauptgrund der Bridge, §13), dafür ein Traceback im
   HA-Core-Log pro Report-Event jeder abonnierten Entity. Die Tests konnten das nicht finden, weil
   der Bridge-Code nie ausgeführt wird (Fake-HA emuliert nur das App-Protokoll).
3. **OPUS-A1-003 (HIGH)** — die Runtime **verwirft** `state_changed` mit `restored: true`
   (HA schreibt das bei jedem Integrations-Reload/Unload als `unavailable`); der Contract bleibt
   `valid` mit altem Wert. Evidence-Hard-Gate (§8.3) wird im realen Pfad umgangen.
4. **OPUS-A1-004 (HIGH)** — Adapter-Retry-Schleifen schreiben **alle 2 s eine `history_gap`**, und
   jede Gap setzt **alle** Temporal-Anker zurück. Fehlende Bridge oder MQTT-Broker-Ausfall macht
   jedes `stable_for` > 2 s unerfüllbar und flutet DB/RAM.
5. **OPUS-A1-005 (HIGH)** — Grace kann nach Lücke/Neustart aus einem **Stunden alten `last_valid`**
   neu starten und einen erfundenen `held`-Wert publizieren (§9.1 „nie neue Grace“).

Dazu kommen 15 MEDIUM- und 12 LOW-Befunde (Restore-Randfälle, Overflow-Semantik,
Start-/Shutdown-Robustheit, Exception-Klassifikation, Testlücken).

Alle Korrekturen sind **lokal** innerhalb der bestehenden Architektur möglich; keine
Spezifikations- oder Fachentscheidung muss geändert werden.

**Urteil: `READY FOR PRE-INSTALL REMEDIATION`.**

---

## Geprüfter Stand

| Punkt | Wert |
|---|---|
| Repository | `Levtos/core_contract_app` |
| PR | #2, Branch `agent/platform-alpha1`, Base `main` (`4885320`) |
| Geprüfter Commit | **`db85981d2c282b9d597a806fc07022e08f97c802`** (= aktueller PR-Head bei Prüfung; nicht weitergelaufen) |
| Umfang | 76 Dateien, +9307/−1, 5 Commits (`0707bbe` … `db85981`) |
| Spezifikation | [`docs/platform-alpha1/build-specification.md`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/docs/platform-alpha1/build-specification.md), [`docs/platform-alpha1/codex-build-prompt.md`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/docs/platform-alpha1/codex-build-prompt.md) |
| Fachakte | nicht benötigt — die Spezifikation war für alle geprüften Semantiken ausreichend; nichts daraus übernommen |
| Arbeitsweise | isolierter lokaler Clone des geprüften Commits, `uv sync --frozen`, keine Änderung an bestehenden Checkouts, keine Codeänderung |
| Eigene Läufe | `pytest` 81 passed / 5 skipped (kein PG lokal); `ruff check`, `ruff format --check`, `mypy --strict` (24 Dateien) fehlerfrei; Reproduktionsskript R1–R10 (unten) |
| CI-Nachweis | [Run 37688733235](https://github.com/levtos/core_contract_app/actions/runs/37688733235), `headSha=db85981`, alle 4 Jobs success; Log: **„86 passed in 1.40s“**, 0 skipped; Frontend 3 passed; `found 0 vulnerabilities`; Container-Smoke „PASS“ (amd64) |
| Externe Verifikation | HA-Core-Quelle (`homeassistant/core.py`, `helpers/entity.py`, `helpers/entity_registry.py`) read-only über GitHub; aiohttp 3.14.4 aus dem Lockfile |

### Verifikation der Claims

| Claim | Ergebnis |
|---|---|
| „86 Backendtests bestanden“ | **bestätigt** (CI-Log, 0 skipped) |
| „3 Frontendtests bestanden“ | **bestätigt** |
| „strict mypy erfolgreich“ | **bestätigt** für `src` + Client; **Bridge (`custom_components`) wird nicht typgeprüft und nicht getestet** |
| „Multi-Arch-Images gebaut“ | **bestätigt** (Build); arm64 nie ausgeführt |
| „non-root“ | **bestätigt** (Smoke: UID 10001, Token 0600) |
| „Commit-before-publish“ | **bestätigt** im Mechanismus (siehe Positives); aber Commit pro Tick → 001 |
| „DB-Ausfall/Recovery korrekt“ | **im Kern bestätigt**; Lücken: 013, 020, Crash-nach-Commit ungetestet |
| „keine Domain-Contracts“, „kein Shadow“, „keine Profile“ | **bestätigt** |
| „Restore korrekt“ | **nicht bestätigt** — 005, 006, 007, 008, 009 |
| „Writer Lock korrekt“ | **bestätigt** (mit 020 als Realrisiko) |
| „Bridge ist thin“ | **bestätigt**, aber **funktional defekt** (002) |
| „API/Client resynchronisieren korrekt“ | **im Kern bestätigt** |

---

## Scope Compliance

- Registrierte Typen: exakt `test.echo`, `test.boolean`, `test.fusion`, `test.temporal`,
  `test.state_machine`, alle `fixture: true`, Producer-Code nur unter `src/core_contracts/testing/`.
- `TypeRegistry.register` erzwingt zur Laufzeit `test.`-Präfix und `fixture` ([`src/core_contracts/schema.py:74-80`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/schema.py#L74-L80));
  `test_no_domain_contract_types` prüft die exakte Menge.
- Eigene Volltextsuche (alle 16 Domainbegriffe + `profile|benni|shadow|set_state|consumer_ids|safe_default|hold_last`)
  außerhalb `docs/` und Lockfiles: Treffer ausschließlich `sleep` (Clock/Transport),
  `pg_stat_activity` (Tests), Lucide-`Activity`, CSS-`@media`, negative Validierungstests,
  DOCS-Hinweis auf Bennis Gate. **Keine Domain-Semantik, kein Default-Kontext, keine Profile.**
- Keine Consumer-/Policy-Migration, Legacy-Repo unberührt.
- `installation_id` ist nicht Teil von IDs oder Zeilen.

**Ergebnis: Scope eingehalten.**

---

## Architecture / Runtime

- Ein serialisierter Processor (`Runtime.run`) ist der einzige Pfad, der den autoritativen Zustand
  ersetzt; `self.state` wird nur nach erfolgreichem `store.commit` getauscht
  ([`src/core_contracts/runtime.py:588-617`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L588-L617)). Netzwerk-Callbacks schreiben nur `latest`/Flags.
- **Strukturproblem (001):** Der Processor arbeitet nicht mit Changesets, sondern klont pro Schritt
  den gesamten `State` inklusive aller History- und Publication-Tabellen ([`runtime.py:249`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L249),
  [`persistence.py:64-65`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L64-L65)) und jede Auswertung erzeugt eine neue Publication für **alle** Contracts
  ([`runtime.py:430`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L430), [`504-506`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L504-L506), [`518-523`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L518-L523)). Der Scheduler tickt alle 0,5 s ([`app.py:173-176`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L173-L176)) und
  jeder Tick committet mit `publication=True` ([`runtime.py:359-379`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L359-L379)).
- Zeitbasierte Auswertung erfolgt per 2-Hz-Polling aller Contracts statt geplanter Fälligkeiten
  (§9.6 „plant Deadlines, Grace-Enden …“). Funktional korrekt (≤0,5 s Latenz), aber Ursache von 001.
- Supervision: alle Dienste laufen in einer `TaskGroup`; jede nicht klassifizierte Exception eines
  Adapters beendet die gesamte App (013).
- Lost-Wakeup bei Revisionswechsel während des HA-Handshakes (015).

## Registry

- Geschlossene Pydantic-Modelle (`extra="forbid"`) lehnen `profile`, `profile_id`, `consumer_ids`,
  Shadow-Felder und unbekannte Parameter ab; geheimnisverdächtige Schlüssel und Credential-URLs
  werden rekursiv abgewiesen; Größen-/Tiefenlimit ([`src/core_contracts/registry.py:88-133`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/registry.py#L88-L133)).
- Referenzen, Zyklus (inkl. Selbstreferenz), `enabled`-Konsistenz, Pflichtinputs,
  Parameter-Vollständigkeit über Typmodelle, eine Binding je Source, `source_origin == "local"`
  nur in der Alpha-Validierung (§10.5 eingehalten).
- Revisionen unveränderlich, fortlaufend, SHA-256; Aktivierung atomar mit
  `expected_active_revision`; Rollback = neue Revision, Historie bleibt; Drafts mit
  `draft_version`, nie ausgewertet; Export ohne Runtime-Zustand.
- Fingerprints: semantisch (ohne Anzeigenamen), inkl. Typbeschreibung, Parameter und vorgelagerter
  Fingerprints; Latches und Source-Observations folgen dem Fingerprint bei Aktivierung.
- Schwächen: Doppelpfad-Erkennung nur über frei deklarierten `physical_source_key` (021);
  Validierungsfehler gelangen nicht bis zum Admin (018); Startfall-Fehler bei nie aktiven
  Contracts (008).

## Quality / Evidence / Freshness

- `FieldValue` erzwingt alle fünf Status sauber getrennt ([`src/core_contracts/quality.py:65-88`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/quality.py#L65-L88)):
  `unknown`/`unresolved` nur mit Reason + `degraded`; `held` nur mit `held_until`,
  `grace_declared`, Reason, `healthy`; `not_applicable` nur mit positiver Feststellung;
  Wert-/Null-Pflichten. `validate_fields` revalidiert jedes Ergebnis zur Laufzeit.
- Held-Propagation: frühestes `held_until`, keine Erneuerung aus `held` ([`quality.py:104-124`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/quality.py#L104-L124),
  [`temporal.py:48-49`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/temporal.py#L48-L49)).
- Evidence: Empfangszeit ist nie Messzeit; fehlende Messzeit → `input_stale`; restored, retained,
  assumed, Zukunftszeit sind harte Gates in `assess` ([`src/core_contracts/evidence.py:101-155`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/evidence.py#L101-L155)).
  `last_updated` allein ist keine neue Beobachtung (getestet).
- **Aber:** Die Runtime verwirft „nicht neue“ Observations vollständig, bevor `assess` sie sehen
  kann (003). Damit greift das restored-Gate im realen Pfad nicht.
- `since_at` einer Attribut-Binding stammt aus dem `last_changed` des Entity-Zustands (007).
- Reasons stammen ausschließlich aus dem Katalog; das Feld `input` benennt teils den Operator statt
  des betroffenen Inputs (029).

## Temporal / State Machine / Restore

| Baustein | Befund |
|---|---|
| Deadline | absolute UTC, Episoden-gebunden, `fired` verhindert Doppelauslösung nach Rücksprung; Überfälligkeit bei Restore ausgewertet ✓ — Fixture verwendet `deadline_overdue_unprocessed` aber auch im Normalbetrieb (028) |
| `since_at`/Anker | persistiert ✓; Attribut-Quellen falsch belegt (007) |
| `stable_for`/`dwell` | Lücke entwertet Anker ✓ (Spezifikationsbeispiel 12:00:18 getestet); **Overflow entwertet nicht** (006); **jede Adapter-Gap entwertet alle** (004) |
| Grace | Restzeit nach Restore ✓, kein Neustart auf `restore`-Origin ✓, Ablauf nicht erneuerbar ✓; **Neustart aus veraltetem `last_valid` nach Lücke/Neustart** (005) |
| Hysterese-Latch | nicht persistiert, nach Restart `initial`, über Revision nur bei gleichem Fingerprint ✓ (mit echtem Restart-Pfad getestet) |
| Edge-Baseline | `unknown` überschreibt nicht, Fingerprint-Regel, keine Flanke bei `restore`/`revision` ✓ |
| SM | Guards, Commands nur als Anforderung, abgelehnte Commands mit Reason, Episoden, Sessions ✓; **keine Initialzustand-Regel für fehlenden/inkompatiblen/veralteten Kontext → dauerhaft `unknown`** (009) |
| Commands | nie wiederholt ✓ |
| Monotonic | nie persistiert ✓ |
| Startfälle | `start_case` unterscheidet alle sechs Fälle ✓; **`ever_active` wird für nie aktive Contracts falsch `True`** (008) |

Die Restore-Tests rufen überwiegend `Temporal.restore` direkt mit synthetischen Werten auf; ein
echter Neustartpfad (persistierter Zustand → Snapshot → Live-Event) ist nur für Latch und SM
abgedeckt. Genau dort liegen 005 und 009.

## PostgreSQL / Persistence

- Writer: dedizierte Verbindung, `pg_try_advisory_lock`, Lock-Besitz über `pg_locks` vor jedem
  Commit geprüft, Migrationen unter Lock, Checksumme (CRLF-normalisiert), `newer_database_schema`,
  Transaktion je Changeset, Generation gegen veraltete Changesets
  ([`src/core_contracts/persistence.py:86-211`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L86-L211)). ✓
- Fachliche Zeitstempel aus der App-Clock ✓; keine ORM-/privaten asyncpg-Interna ✓; TLS über
  `SSLContext` mit konfigurierbarer CA ✓.
- **In-doubt-Commit** (Verbindung bricht nach COMMIT ab): Runtime markiert unavailable, Recovery
  lädt aus der DB neu → konsistent, Commands werden per gespeichertem Ergebnis idempotent
  beantwortet. ✓ (aber nicht getestet, 019)
- **Problem 001:** `load()` lädt **alle** Tabellen inklusive aller Historie und aller Publications
  in den RAM; `commit()` diffed alle Tabellen zeilenweise und klont danach erneut den Gesamtzustand.
  Spezifikation §12.3 verlangt ein Changeset je Schritt — die Implementierung schreibt zwar nur
  geänderte Zeilen, bezahlt dafür aber O(Gesamtbestand) CPU und RAM pro Schritt.
- Lesepool wird angelegt, aber nicht verwendet (NOTE).
- Netzwerk-Partition: alte Server-Session kann den Advisory-Lock halten, bis PostgreSQL den toten
  Peer erkennt (020).

## HA Bridge

- Dünn: keine Entities/Services/Timer/Speicher/Quality; gefilterte Listener
  (`async_track_state_change_event`, `async_track_state_report_event`) nur für angefragte Entities;
  Snapshot und Listener im selben Callback ohne `await` ([`custom_components/core_contracts_bridge/__init__.py:76-105`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L76-L105)). ✓
- `require_admin` auf beiden Kommandos ✓; `single_config_entry` ✓.
- **002:** `reported` liest `event.data["new_last_reported"]` ([`__init__.py:68`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L68)) — existiert in HA
  nicht → `KeyError` in jedem Report-Callback.
- Lebenszyklus: WS-Kommandos werden beim Unload nicht deregistriert; `entry.async_on_unload`
  sammelt pro Subscription einen Callback an (025).
- App-Seite: Ablauf Auth → info → get_config → Lifecycle-Events → subscribe wie spezifiziert ✓;
  fehlende/inkompatible Bridge ohne Fallback ✓ (getestet). Aber: Gap-Flut bei Retry (004),
  `device_timestamp`-Parsefehler reißt den Adapter ab (014), Snapshot-Größe durch Queue begrenzt
  und `await` auf den Processor innerhalb der WS-Leseschleife (016), `state_reported` wird auch für
  `event_stateful`-Quellen abonniert und verarbeitet (017).

## MQTT

- Nur Source-Ingestion, kein Contract-/Command-Bus ✓; retained nie positive Evidence ✓;
  QoS-/Inhalts-Duplikate per Digest dedupliziert ✓; ohne `mqtt_time_path` → `input_stale` (harte
  Messzeit-Regel, konsequent) ✓; Doppelpfad über `physical_source_key` (021).
- **004:** ungültiger Payload (z. B. Plain-Text „ON“, verbreitet bei MQTT) erzeugt pro Nachricht
  eine `history_gap` und setzt alle Temporal-Anker zurück, statt eine Observation mit
  `invalid_value` zu liefern; Retry-Schleife mit Gap alle 2 s.
- Watcher pollt Revision/Resubscribe 1×/s (NOTE); `TimeoutError` aus der Services-API ist nicht
  klassifiziert (013).

## API / WebSocket / Client

- Zwei Listener; Ingress nur von `172.30.32.2`, Weiterleitungs-Header werden ignoriert (getestet);
  Bearer mit `compare_digest`; Schreibrechte nur Admin außer `commands`; Cross-Site-Schreibschutz
  auf Ingress; Body-Limit 2 MB, WS 64 KB; keine Reflexion von Eingaben in Fehlern ✓.
- WS: `hello`/`welcome`/`installation_mismatch`, Queue-Registrierung und Snapshot ohne `await`
  dazwischen (atomar), `delta` mit `prev_seq`, begrenzte Subscriber-Queue → `resync_required`,
  Epoche → `resync_required`, Ping/Pong, `going_away` ✓.
- Client: keine Defaults, Installationsprüfung, Resync bei `prev_seq`-/Epochenbruch ohne doppelte
  oder verschluckte Deltas, Command-Antwortverlust → Abfrage per stabiler ID → idempotenter Retry ✓.
  Schwächen: endlose 1-s-Retries bei 401/403, `message.json()`-Fehler beendet den Iterator (030).
- Shutdown wartet mit offenen WS-Verbindungen bis zu 60 s (aiohttp-Default) (012).
- Validierungsfehler werden zu `invalid_request` ohne Ursache (018).

## Commands

- Envelope mit Pflicht-`valid_until`, `origin`, optional `expected_registry_revision` ✓.
- Gleiche ID + gleicher Inhalt → gespeichertes Ergebnis ohne neue Wirkung; anderer Inhalt →
  `command_id_conflict`; abgelaufene Commands → `expired`; Wirkung und Ergebnis in **einem** Commit,
  Ack danach; DB-Ausfall → kein Ack; nach Restart keine Wiederholung ✓ (getestet inkl. Restart).
- Kein `set_state`, keine freie Wertmutation ✓.
- Reason-Mapping von `expected_registry_revision`-Mismatch auf `config_incomplete` ist unscharf (NOTE).

## Supervisor / Container / Resource Risk

- `config.yaml` entspricht §14.2 (inkl. `watchdog` auf `/health/live`, `hassio_api: false`,
  `ports: {8787/tcp: null}`, `init: true`, `timeout: 30`, `backup: hot`, `services: [mqtt:want]`,
  `map: [ssl:ro]`, Default `mqtt_mode: disabled`) ✓.
- Dockerfile: explizites `FROM python:3.14.5-slim-bookworm`, Multi-Stage, `uv sync --frozen`,
  kein `BUILD_FROM`/`build.yaml`, Entrypoint als root nur für `/data`, dann `setpriv` UID 10001,
  `HEALTHCHECK` nur Liveness ✓.
- `image:` in `config.yaml` erzwingt einen Pull; lokale Installation nur über [`dev/stage_app.py`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/dev/stage_app.py)
  (dokumentierte Abweichung). **Der gestagte Build-Kontext wird in CI nie gebaut** (CI baut vom
  Repo-Root) → zusätzlicher automatisierbarer Nachweis möglich.
- **Ressourcenrisiken:** 001 (CPU/RAM/DB unbegrenzt, Event-Loop-Blockade), 004 (Gap-Flut),
  016 (Snapshot-Overflow-Schleife), 011 (Liveness-Lücke während Restore), 012 (Shutdown > 30 s),
  013 (Exception → App-Exit → Restart), 020 (Lock nach Partition).
- Polling: `SystemClock.run` 10 Hz, MQTT-Watcher 1 Hz, Scheduler 2 Hz (NOTE; 2 Hz ist Teil von 001).

## Security

- Tokens: 256 Bit (`token_urlsafe(32)`), Datei 0600 über atomaren Schreibpfad, Mindestlänge beim
  Laden, zeitkonstanter Vergleich, Rotation ✓. Supervisor-Token nur aus Umgebung ✓.
  PostgreSQL-/MQTT-Passwörter als `password`-Optionen, nicht geloggt; JSON-Logformat ohne
  Exception-Text; Startfehler ohne Konfigurationswerte (getestet) ✓.
- Ingress-Peer-Prüfung ohne Header-Vertrauen ✓; statische Auslieferung gegen Path Traversal
  abgesichert ✓; CSP/nosniff/no-store ✓; keine CORS-Freigabe ✓.
- Registry/Drafts weisen Secrets ab ✓. Keine Secrets in Git/CI außer dem ephemeren
  CI-Testpasswort ✓.
- Kleinere Punkte: Rate-Limit greift erst nach erfolgreicher Authentifizierung und teilt einen
  Schlüssel je Quell-IP (027); Actions per Tag statt SHA gepinnt (NOTE); MQTT ohne TLS-Option (NOTE).
- **Kein realer Sicherheitsbruch gefunden.**

## Admin UI

- Funktionsumfang nach §26 vorhanden (Status, Diagnostics/Gaps, Revisionen, Draft-JSON-Editor,
  Validate/Activate mit OCC, Rollback als neue Revision, Export, Sources/Bindings,
  Evidence je Source, TEST-Kennzeichnung, Token-Rotation); relative Pfade für Ingress korrekt;
  keine `{@html}`-Ausgabe (XSS-sicher).
- Schwächen: Validierungsfehler ohne Ursache (018); Token-Rotation (sofortige Invalidierung aller
  Consumer) und Rollback ohne Bestätigung; deaktivierte Contracts unsichtbar; ein
  Validierungsfehler setzt den globalen Status auf „Fehler“ (026). Die offene Admin-UI hält eine
  WS-Verbindung und verlängert dadurch den App-Stop (012).

## Tests / CI

- CI ist ehrlich: keine `continue-on-error`, kein `if: false`, PostgreSQL-Service, frozen Lock,
  Ruff/Format/mypy/pytest/Wheels/Frontend/Audit/Multi-Arch, Container-Smoke amd64. ✓
- **Aussagekraft-Lücken (019):**
  - Bridge-Integration wird nie ausgeführt; [`dev/fake_ha.py`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/dev/fake_ha.py) emuliert nur das App-Protokoll → 002
    unentdeckbar; G2 „automatisiert bestanden“ ist überzeichnet.
  - Kein Soak-/Ressourcentest → 001 unentdeckt.
  - `test_overflow_and_slow_subscriber` prüft den DB-aus-Pfad, nicht `QueueFull`; der echte
    Overflow-Pfad ist ungetestet (006, 010).
  - Restore von Grace/`stable_for` nur über direkte `Temporal.restore`-Aufrufe, nicht über
    Restart → Snapshot → Live-Event (005).
  - Kein Test mit `restored: true`-Live-Event (003), keine SM-Parameteränderung/Re-Enable (008/009).
  - `test_overdue_deadline_with_unusable_guard_is_unknown` ist auch mit erfülltem Guard grün
    (Zustand `a` hat keine Deadline-Transition) → testet nicht, was der Name behauptet (028).
  - Kein Crash-nach-Commit-Test (§28), kein SIGTERM mit offener WS-Verbindung.
  - Client-Verlustantwort und langsamer Consumer nur auf Runtime-Ebene, nicht über den Client.

---

## G1–G15

| Gate | Status | Begründung |
|---|---|---|
| **G1** Installation non-root | **PARTIAL** | Container-Smoke beweist UID 10001/0600/Start ohne DB. Supervisor-Installation offen; gestagter Build-Kontext nie gebaut; arm64 nie ausgeführt. |
| **G2** Bridge | **FAIL** | `reported`-Callback wirft auf echtem HA (002). Bridge-Code ist durch keinen Test ausgeführt; Fake-HA prüft nur die App-Seite. |
| **G3** Registry | **PARTIAL** | Draft → Validierung → Aktivierung → Rollback über Runtime/API getestet ✓. UI-Smoke offen; Validierungsfehler ohne Ursache (018); SM-Fixture bleibt nach Parameteränderung dauerhaft `unknown` (009). |
| **G4** Isolation | **PASS** | Vollständige Matrix inkl. Mismatch, Initialisierung, Adoption; Recovery prüft die ID erneut. |
| **G5** Persistenz | **PASS** | Registry und Runtime-Kontext überleben Neustart (PG-CI). Skalierungsproblem separat als 001. |
| **G6** Restore | **FAIL** | Grace aus veraltetem `last_valid` (005), Overflow-Kontinuität (006), Attribut-`since_at` (007), falscher Startfall (008), SM ohne Re-Initialisierung (009). |
| **G7** Publication E2E | **PASS** | Alle fünf Fixtures über Source → Binding → Evidence → Producer → Persistenz → Publication; PG-Pfad für Echo. |
| **G8** Client | **PARTIAL** | Snapshot, Subscription, `prev_seq`-Lücke, Epoche → Resync über echten Client ✓; langsamer Consumer und Command-Antwortverlust nur auf Runtime-Ebene. |
| **G9** DB-Ausfall | **PARTIAL** | Commit-before-publish mit Fehlerinjektion, Ausfall/Recovery mit Epoche + Gap, exklusiver Lock ✓. Crash-nach-Commit ungetestet; Recovery-Exceptions (013) und Partition-Lock (020) offen. |
| **G10** Health | **PARTIAL** | Liveness ≠ Readiness, DB-Ausfall ohne Restart im Docker-Smoke ✓. Liveness-Lücke während Startup-Restore (011); Supervisor-Watchdog offen. |
| **G11** Quality/Evidence | **FAIL** | Invarianten ✓; Evidence-Regel restored/unavailable im Runtime-Pfad verletzt (003). |
| **G12** No-Shadow/enabled/keine Profile | **PASS** | Drafts nie ausgewertet, `enabled=false` nicht ausgewertet/publiziert, `contract_disabled`, Profilfelder abgewiesen, API ohne Profil. |
| **G13** Kein Domain-Code | **PASS** | Nur `test.*`, Laufzeit-Erzwingung plus Test; eigene Suche bestätigt. |
| **G14** Qualität | **PASS** | Ruff, Format, mypy strict, 86/86, Multi-Arch-Build — selbst verifiziert. |
| **G15** Doku | **PARTIAL** | Betrieb, API, Abweichungen, Build-Time-Checkliste vorhanden. Abschlussbericht überzeichnet G2/G6; Abweichung 4 unterschätzt die Folge des In-Memory-Modells. |

---


---

Source: https://github.com/levtos/core_contract_app/pull/2#issuecomment-6054558431
Author: levtos-claude
Updated: 2026-10-08T07:08:51Z

> **Opus Pre-Install-Review · PR #2 · Teil 2/3** · Urteil **`READY FOR PRE-INSTALL REMEDIATION`** · Commit `db85981` · Fortsetzung von Teil 1: [Teil 1](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054556193)

## Findings

### OPUS-A1-001 · BLOCKER · Tick-getriebenes, unbegrenztes Wachstum von CPU, RAM und DB

**Bereich:** [`src/core_contracts/app.py:173-176`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L173-L176), [`src/core_contracts/runtime.py:249`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L249), [`359-382`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L359-L382),
[`414-523`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L414-L523) (insb. [`430`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L430), [`504-506`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L504-L506), [`518-523`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L518-L523)), [`src/core_contracts/persistence.py:56-65`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L56-L65), [`157-211`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L157-L211),
[`src/core_contracts/api.py:179`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L179), [`191-197`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L191-L197).

**Beobachtung:**
- Der Scheduler ruft alle 0,5 s `runtime.tick()`; jeder Tick führt `probe`, eine vollständige
  Auswertung **aller** Contracts und `_commit(publication=True)` aus — auch wenn sich nichts
  geändert hat. Ohne aktive Registry wird trotzdem alle 0,5 s ein Commit geschrieben.
- Jede Auswertung schreibt pro Contract eine `contract_state_history`-Zeile (`f"{seq}:{key}"`) und
  eine neue `publication`.
- `process()` klont pro Arbeitsschritt den gesamten `State` per `model_copy(deep=True)`;
  `PostgresStore.commit` diffed jede Tabelle vollständig und klont danach erneut.
- `load()` lädt beim Start und bei jeder Recovery alle Tabellen inklusive aller Historie und aller
  Publications in den Speicher.
- Diagnostics liefert alle Gaps; `history/{id}` scannt alle History-Zeilen.

**Reproduktion (R1, Beispiel-Registry, 5 Contracts, MemoryStore + FakeClock):**

```
ticks=    1 seq=    2 history_rows=    10 publications=    2 tick_ms=   2.91
ticks=  300 seq=  301 history_rows=  1505 publications=  301 tick_ms=  57.90
ticks=  600 seq=  601 history_rows=  3005 publications=  601 tick_ms= 123.06
ticks= 1200 seq= 1201 history_rows=  6005 publications= 1201 tick_ms= 240.24
```

1200 Ticks entsprechen 10 Minuten realer Laufzeit. Ab ~20 Minuten übersteigt ein Tick das
Tick-Intervall; nach einem Tag wären es ~430 000 History-Zeilen, ~170 000 Publications und
Sekunden pro Tick. Ein Lauf mit 4000 Ticks brach nach > 10 min Wandzeit ab.

**Warum problematisch:** Die Arbeit läuft synchron im Event-Loop (Deep-Copy, kanonisches JSON).
Folgekette auf einer realen HA-Installation: steigende Latenz aller Endpunkte → volle
Processor-Queue → `ingest_overflow`-Gaps und Resubscribe-Stürme gegen HA → Speicherwachstum bis
OOM → Neustart lädt die gesamte Historie ohne Liveness-Listener (011) → Watchdog-Restart-Schleife.
Zusätzlich DB-/WAL-Last von ≥ 2 Transaktionen/s und 2 Hz Deltas an jeden Subscriber.

**Verstoß gegen:** §12.3 (Changeset je Schritt), §14.4 (begrenzte Ressourcen, kein stilles
Verwerfen durch Folge-Overflow), §21 (externe Last darf keinen Watchdog-Restart erzeugen), §8.2
(Re-Evaluation/Re-Publication ist keine neue Beobachtung — hier wird sie aber als neuer
Publikationsstand persistiert), Pre-Install-Ressourcenanforderung des Auftrags.

**Empfohlene minimale Korrektur:**
1. Publication und History nur bei inhaltlicher Änderung eines Envelopes (Vergleich ohne
   `computed_at`/`published_at`/`publication_seq`); idle Ticks committen nichts.
2. Timer-Auswertung nur für fällige Contracts (Deadline, Grace-Ende, `stable_for`-Schwelle,
   Freshness-Ablauf) — idealerweise geplant über `Clock.call_at_utc`, mindestens aber gefiltert.
3. Persistenz als echtes Changeset: History-/Publication-/Gap-Zeilen append-only schreiben und
   **nicht** im In-Memory-`State` halten; `load()` lädt nur aktuelle Tabellen; kein Gesamt-Clone
   pro Schritt.
4. History-/Gap-Abfragen der API direkt aus der DB mit `ORDER BY … LIMIT`.

**Tests:** Soak-Test (z. B. 10 000 Ticks FakeClock) mit Assertion: keine neuen Zeilen und
konstante Schrittzeit ohne Eingangsänderung; PG-Test „Idle-Tick erzeugt keine Transaktion mit
Publication“; Test, dass `load()` die History nicht materialisiert.

---

### OPUS-A1-002 · BLOCKER · Bridge-`reported`-Callback wirft auf echtem Home Assistant

**Bereich:** [`custom_components/core_contracts_bridge/__init__.py:61-73`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L61-L73) (Zeile 68).

**Externe Belege (HA-Core `803d2e5`):** [`EventStateReportedData`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/core.py#L146-L154) · [`async_set_internal` feuert `last_reported`/`old_last_reported`/`new_state`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/core.py#L2479-L2491) · [Dispatcher loggt Exceptions je Event](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/event.py#L344)

**Beobachtung:** Der Callback liest `event.data["new_last_reported"]`. Die reale HA-Struktur
(`homeassistant/core.py`, `EventStateReportedData` und `async_set_internal`) liefert
`entity_id`, `last_reported`, `old_last_reported`, `new_state` — **kein** `new_last_reported`.

**Warum problematisch:** Jeder `state_reported` einer abonnierten Entity löst im HA-Core einen
`KeyError` aus; HAs Dispatcher protokolliert pro Event einen Traceback
(„Error while dispatching event …“). Kein Report erreicht die App. Damit fehlt genau die Fähigkeit,
für die die Bridge laut §13 existiert (Heartbeat-Freshness, `last_reported`), und die produktive
HA-Instanz erhält einen dauerhaften Fehlerstrom aus fremdem Code.

**Verstoß gegen:** §13 (Protokoll `reported`), G2.

**Failure-Szenario:** Erste reale Installation, Binding auf einen Sensor, der alle 10 s denselben
Wert meldet → 8 640 Tracebacks/Tag im HA-Log, `report_heartbeat`-Sources werden nach Intervall
`input_stale`.

**Empfohlene minimale Korrektur:** `event.data["last_reported"].isoformat()` verwenden
(optional zusätzlich `new_state.last_reported`).

**Tests:** Bridge im echten HA-Testkern ausführen (z. B. `pytest-homeassistant-custom-component`):
`info`, `subscribe` mit Snapshot inkl. absent, `changed`, `reported` (gleiche Werte erneut setzen),
Reihenfolge, Reload/Unload. Mindestens ein Unit-Test mit einem Event-Objekt nach der echten
`EventStateReportedData`-Struktur. Zusätzlich hassfest/HACS-Validierung in CI.

---

### OPUS-A1-003 · HIGH · Restored-/Unavailable-Live-Events werden verworfen; Contract bleibt `valid`

**Bereich:** [`src/core_contracts/runtime.py:339-358`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L339-L358), [`src/core_contracts/evidence.py:83-98`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/evidence.py#L83-L98),
[`src/core_contracts/adapters/ha.py:95`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L95).

**Externe Belege (HA-Core `803d2e5`):** [`Entity.async_remove` → `write_unavailable_state`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/entity.py#L1494-L1549) · [`write_unavailable_state` setzt `unavailable` + `restored: True`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/entity_registry.py#L477-L502)

**Beobachtung:** `is_new()` liefert für `ha_restored`/`mqtt_retained` immer `False`; die Runtime
verwirft jede nicht neue Nicht-Snapshot-Observation vollständig (`return None`), bevor sie
gespeichert oder durch `assess` bewertet wird.

**Realer Auslöser (verifiziert in HA-Quelle):** `Entity.async_remove` schreibt bei jedem
Config-Entry-Unload/Reload `unavailable` mit `restored: true`
(`helpers/entity.py` → `RegistryEntry.write_unavailable_state`) als normales `state_changed`.

**Reproduktion (R2):**
```
before: valid True
after restored-unavailable event: valid True | stored availability: available
```

**Warum problematisch:** Die Quelle ist real nicht verfügbar, der Core publiziert weiter den alten
Wert als `valid` (bei `event_stateful` unbefristet). Das ist eine zweite, falsche Wahrheit und
umgeht das harte Gate „restaurierter Wert“ (§8.3) sowie „persistiert = valid ist verboten“ (§7.1).

**Empfohlene minimale Korrektur:** „Neu“ (für Frische/Flanken/Trigger) von „Zustand der Quelle hat
sich geändert“ trennen: Observations mit geänderter Verfügbarkeit, geändertem `restored`-Flag oder
geändertem Wert immer als aktuelle Evidence speichern und bewerten (Origin `revision`, keine Flanke);
nur echte Duplikate verwerfen.

**Tests:** Runtime-Test: valid → Live-Event `unavailable` + `restored: true` → `unknown`
mit `input_restored`/`input_unavailable`; danach echter Wert → `valid`. Bridge-Reload-Szenario
im HA-Testkern.

---

### OPUS-A1-004 · HIGH · Gap-Flut aus Retry-Schleifen; jede Gap setzt alle Temporal-Anker zurück

**Bereich:** [`src/core_contracts/adapters/ha.py:201-214`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L201-L214), [`src/core_contracts/adapters/mqtt.py:137-138`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/mqtt.py#L137-L138),
[`159-164`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/mqtt.py#L159-L164), [`src/core_contracts/runtime.py:214-233`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L214-L233), [`326-336`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L326-L336).

**Beobachtung:**
- HA- und MQTT-Adapter rufen bei **jedem** fehlgeschlagenen Verbindungsversuch (fester 2-s-Takt,
  kein Backoff) `submit("gap", …)` auf; der HA-Adapter zusätzlich `bridge_state`, das bei
  `unavailable` eine vollständige Auswertung mit Publication committet.
- Jeder ungültige MQTT-Payload erzeugt eine Gap (`mqtt_invalid_message`) statt einer Observation.
- Die Gap-Operation setzt `since_at` **aller** Temporal-Nodes zurück, unabhängig davon, ob deren
  Inputs vom betroffenen Adapter stammen.

**Reproduktion (R8):** HA-Source durchgehend `true`, `stable_for` 10 s, MQTT-Retry alle 2 s:
```
HA source continuously true for 20 s: False | gaps: 10
```

**Warum problematisch:** Fehlende Bridge (häufig bei der Erstinstallation), MQTT-Broker-Ausfall oder
ein Plain-Text-Topic erzeugen unbegrenzt Gap-Zeilen (43 200/Tag), DB-Commits und Publications alle
2 s und machen jedes `stable_for`/`dwell` > 2 s für **alle** Contracts unerfüllbar. Eine Gap
beschreibt fehlende Beobachtungen; eine ungültige Nachricht ist keine Lücke.

**Verstoß gegen:** §9.3 (nur eine unüberbrückte Lücke der ergebnisbestimmenden Source entwertet
den Anker), §13 („HA-Neustart = Reconnect + history_gap“, nicht pro Retry), §14.4, §17, §22.

**Empfohlene minimale Korrektur:** Gap nur beim Übergang connected → disconnected; Anker nur für
Contracts invalidieren, deren Sources an der betroffenen Dependency/dem Adapter hängen;
ungültige MQTT-Payloads als Observation mit `availability=unknown` (`invalid_value`) behandeln;
`bridge_state` nur bei Zustandswechsel auswerten; exponentieller Backoff mit Obergrenze.

**Tests:** Retry-Schleife über 60 s → genau eine Gap; MQTT-Gap lässt HA-gebundenes `stable_for`
unberührt; Plain-Text-Payload → `unknown`/`invalid_value`, keine Gap.

---

### OPUS-A1-005 · HIGH · Grace startet nach Lücke/Neustart aus veraltetem `last_valid`

**Bereich:** [`src/core_contracts/temporal.py:42-66`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/temporal.py#L42-L66), [`src/core_contracts/testing/contract_types/evaluate.py:111`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/testing/contract_types/evaluate.py#L111),
[`src/core_contracts/runtime.py:144-149`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L144-L149), [`326-331`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L326-L331).

**Beobachtung:** `grace()` startet eine Grace, sobald `grace_until is None`, `trigger` und
`last_valid` vorhanden sind. Es wird nicht geprüft, dass der unmittelbar vorherige Stand `valid`
war; `last_valid` wird weder bei Restore noch bei einer Gap verworfen.

**Reproduktion (R6):** valid `True` → Bridge-Verlust → 1 h später Snapshot `unavailable` →
Live-Event `unknown`:
```
1 h later, unknown live change: held True held_until 2026-01-01T13:01:01Z
```

**Realer Pfad:** Gerät offline über HA-Neustart (oder App-Neustart): Snapshot `unavailable`
(restored), danach Live-Event `unavailable` ohne `restored` → Origin `input` → neue Grace mit dem
Wert von vor dem Neustart.

**Warum problematisch:** Publiziert einen `held`-Wert ohne zeitnahe Evidenz — genau die erfundene
Kontinuität, die §9.1 („nie neue Grace“) und §9.4 Schritt 4 verbieten.

**Empfohlene minimale Korrektur:** Grace nur bei einem Übergang aus einem tatsächlich zuletzt
ausgewerteten `valid` starten (z. B. `last_status` im TemporalState) und `last_valid` bei
Restore/Gap verwerfen bzw. als nicht grace-fähig markieren.

**Tests:** Restart-Pfad-Test (persistierter TemporalState → Snapshot unusable → Live unusable →
`unknown`, kein `held`); Gap-Pfad analog; Gegenfall valid → unavailable startet Grace.

---

### OPUS-A1-006 · MEDIUM · Ingest-Overflow erhält `stable_for`-Anker ohne Kontinuitätsnachweis

**Bereich:** [`src/core_contracts/runtime.py:252-259`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L252-L259).

**Beobachtung:** Bei Overflow wird zwar eine Gap geschrieben und die koaleszierte letzte
Observation übernommen, Temporal-Anker werden aber nicht invalidiert (anders als bei der
`gap`-Operation).

**Reproduktion (R7):** Anker 12:00:00, Overflow bei 12:00:12 (Zwischenereignisse verloren):
```
anchor before: 12:00:00Z after overflow: 12:00:00Z
60 s after original anchor: valid True
```

**Verstoß gegen:** M30-14/§9.3, §9.4 („keine erfundene Kontinuität“).
**Korrektur:** Anker der betroffenen Bindings bei Overflow wie bei einer Lücke behandeln
(Continuity-Proof nach §9.3(b) zulassen).
**Tests:** Overflow über `QueueFull` (nicht über `persistence=False`) mit `stable_for`.

---

### OPUS-A1-007 · MEDIUM · `since_at`/Kontinuitätsnachweis für Attribut-Bindings nutzt Zustands-`last_changed`

**Bereich:** [`src/core_contracts/evidence.py:154`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/evidence.py#L154), [`src/core_contracts/adapters/ha.py:67-68`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L67-L68),
[`src/core_contracts/temporal.py:87-97`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/temporal.py#L87-L97).

**Beobachtung:** `assess` setzt `since_at = ha_last_changed`; für `ha_attribute` ist das der
Zeitpunkt der letzten **Zustands**änderung, nicht der Attributänderung. `Temporal.restore`
verwendet genau diesen Wert für §9.3(b).

**Failure-Szenario:** Attribut ändert sich nach dem Anker, der Entity-State nicht → nach Restart
gilt der Anker als belegt kontinuierlich.
**Verstoß gegen:** §9.3(b), §15.2 (`since_at` je Feld).
**Korrektur:** Für Attribut-Bindings `since_at` nur setzen, wenn eine attributbezogene
Änderungszeit belegbar ist (sonst `None` → kein Continuity-Proof).
**Tests:** Attribut-Binding-Restore mit geändertem Attribut und altem `last_changed`.

---

### OPUS-A1-008 · MEDIUM · Nie aktive Contracts werden als `ever_active=True` geführt

**Bereich:** [`src/core_contracts/runtime.py:434-439`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L434-L439).

**Beobachtung:** `"ever_active": bool(lifecycle)` ist für einen bereits vorhandenen Lifecycle-Eintrag
`{ever_active: False, …}` `True` (nicht leeres Dict).

**Reproduktion (R3):**
```
after activation: {'ever_active': False, 'enabled': False}
after one tick:   {'ever_active': True, 'enabled': False}
enabled SM start_case: … 'start_case': 'missing' | field: unknown ['restore_context_missing']
```

**Verstoß gegen:** §9.4 Schritt 1 (Erststart = Instanz nie aktiv), G6 „Startfälle unterscheidbar“.
**Korrektur:** `bool(lifecycle and lifecycle.get("ever_active"))`.
**Tests:** deaktiviert anlegen → Ticks → aktivieren → Startfall `first`.

---

### OPUS-A1-009 · MEDIUM · State Machine ohne Initialzustand-Regel für fehlenden/inkompatiblen/veralteten Kontext

**Bereich:** [`src/core_contracts/statemachine.py:27-41`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/statemachine.py#L27-L41), [`src/core_contracts/testing/contract_types/evaluate.py:123-138`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/testing/contract_types/evaluate.py#L123-L138),
[`src/core_contracts/runtime.py:454-455`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L454-L455).

**Beobachtung:** `Definition` kennt nur `initial`; die Fixture initialisiert ausschließlich im Fall
`first`. Nach Parameteränderung (Fingerprint), Re-Enable (`stale`) oder fehlendem Kontext bleibt die
SM dauerhaft `unknown` — auch bei weiteren Inputs und Ticks.

**Reproduktion (R4):**
```
initial: valid a
after revision + 3 inputs/ticks: unknown ['restore_context_missing']
```

**Warum problematisch:** §6.7 verlangt eine deklarierte „Initialzustand-Regel“; §9.4 Schritt 5 macht
nur **Unbestimmbares** `unknown`. Ohne Regel gibt es keinen Wiederanlauf außer einer neuen
`contract_id`. Der reale G3-Smoke (aktivieren, Parameter ändern, Rollback) endet für
`test.state_machine` im Dauer-`unknown`; Phase-2-SMs hätten denselben Strukturmangel.
**Korrektur:** Deklarative Regel je Definition (z. B. `on_missing_context: initial|unknown_until_<event>`),
die das Framework bei `missing/incompatible/stale` anwendet; Fixture nutzt sie.
**Tests:** Parameteränderung, Re-Enable, verlorener Kontext → definierter Wiederanlauf.

---

### OPUS-A1-010 · MEDIUM · Overflow-Gap und koaleszierte Observations gehen still verloren

**Bereich:** [`src/core_contracts/runtime.py:249-259`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L249-L259) mit [`283-285`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L283-L285), [`287-288`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L287-L288), [`341-350`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L341-L350).

**Beobachtung:** Der Overflow-Block schreibt Gap und `latest` nur in den geklonten Zustand und leert
danach sofort `latest`/`overflow`. Endet der Arbeitsschritt ohne Commit (`validate`,
Observation für unbekanntes Binding, nicht neue Observation, OCC-Konflikt), ist beides verloren.

**Reproduktion (R5):**
```
gaps before/after: 0 0 | latest buffered: 0 | overflow flag: False | stored obs value: None
```
**Verstoß gegen:** §14.4 („Überlauf wird sichtbar … kein stilles Verwerfen“).
**Korrektur:** Overflow-Übernahme als eigener, sofort committeter Arbeitsschritt (oder Flags erst
nach erfolgreichem Commit zurücksetzen).
**Tests:** Overflow gefolgt von `validate` → Gap persistiert, Observation angewendet.

---

### OPUS-A1-011 · MEDIUM · Kein Liveness-Listener während Startup-Restore; SIGTERM im Startfenster wird verschluckt

**Bereich:** [`src/core_contracts/app.py:72-75`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L72-L75), [`90`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L90), [`102-103`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L102-L103), [`131-166`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L131-L166).

**Beobachtung:** Der Bootstrap-Healthserver wird nach `store.open()` beendet; der API-Listener startet
erst nach `reconcile`, zweifachem `store.load()` und `runtime.start()` (Restore-Commit). In diesem
Fenster beantwortet nichts `/health/live`. Zusätzlich bleibt bis Zeile 165 der
Bootstrap-Signalhandler aktiv, der nur ein verwaistes Event setzt — ein SIGTERM in diesem Fenster
wird ignoriert, Supervisor beendet nach 30 s per SIGKILL.
**Warum problematisch:** Zusammen mit 001 wächst das Fenster mit der Historie → Watchdog-Restart
während des Restores → Restart-Schleife (§21).
**Korrektur:** Health-Listener ab Prozessstart bis zum Shutdown durchgehend betreiben; Signalhandler
einmal registrieren und das Event im Startpfad beachten; den doppelten `store.load()` für
`last_shutdown.json` entfernen.
**Tests:** Startup mit künstlich verzögertem Restore: `/health/live` antwortet durchgehend;
SIGTERM während Restore → geordneter Exit < 30 s.

---

### OPUS-A1-012 · MEDIUM · Shutdown überschreitet `timeout: 30` bei offenen WebSocket-Verbindungen

**Bereich:** [`src/core_contracts/app.py:225-239`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L225-L239), [`src/core_contracts/api.py:240-301`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L240-L301),
[`src/core_contracts/runtime.py:649`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L649); aiohttp 3.14.4 `BaseRunner(shutdown_timeout=60.0)`.

**Externe Belege (aiohttp `v3.14.4`):** [`BaseRunner(shutdown_timeout=60.0)`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/web_runner.py#L263-L277) · [`cleanup()` wartet `shutdown_timeout`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/web_runner.py#L316-L331)

**Beobachtung:** `going_away` wird gesendet, die Sockets aber nicht geschlossen; es gibt keinen
`on_shutdown`-Handler. `AppRunner.cleanup()` wartet je Runner bis zu 60 s auf laufende Handler;
beide Runner werden nacheinander und außerhalb des 25-s-Timeouts aufgeräumt.
**Failure-Szenario:** Admin-UI geöffnet (hält eine WS über Ingress) → App-Stop/Update → > 30 s →
SIGKILL. Der Container-Smoke prüft SIGTERM ohne WS-Clients.
**Verstoß gegen:** §14.5 („innerhalb von `timeout`“).
**Korrektur:** WS-Verbindungen nach `going_away` serverseitig schließen (`on_shutdown`),
`shutdown_timeout` klein setzen und Cleanup in das Zeitbudget aufnehmen.
**Tests:** Smoke mit offener WS-Verbindung → Exit-Code 0 < 30 s.

---

### OPUS-A1-013 · MEDIUM · Unvollständige Exception-Klassifikation beendet die gesamte App

**Bereich:** [`src/core_contracts/app.py:96`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L96), [`190`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L190), [`213-223`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L213-L223), [`src/core_contracts/adapters/ha.py:209`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L209),
[`src/core_contracts/adapters/mqtt.py:159`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/mqtt.py#L159).

**Externe Belege (aiohttp `v3.14.4`):** [`TimerContext` wirft plain `asyncio.TimeoutError`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/helpers.py#L705-L759)

**Beobachtung:**
- Bootstrap fängt `PersistenceUnavailable("writer_lock_unavailable")` nicht → bei gehaltenem Lock
  (zweite Instanz, alte Session nach Partition) Prozess-Exit statt „nicht ready“.
- Recovery-Loop fängt `asyncpg.InterfaceError` (z. B. `ConnectionDoesNotExistError` während
  `migrate`/`load`) nicht → `health`-Task scheitert → TaskGroup bricht ab → Exit.
- aiohttp-Gesamttimeout wirft plain `TimeoutError` (aiohttp `helpers.TimerContext`) — weder im
  HA- noch im MQTT-Tupel (Services-API, WS-Handshake) → Exit.
- Unerwartete Nachrichtenform (`KeyError`/`AttributeError`) im HA-Adapter → Exit.
**Warum problematisch:** Ein externer Ausfall erzeugt einen Prozess-Exit und damit einen
Supervisor-Neustart — §21 („Ausfall externer Abhängigkeiten erzeugt nie einen Watchdog-Restart“).
**Korrektur:** Adapter- und Recovery-Schleifen fangen alle Nicht-Abbruch-Exceptions, melden sie als
Komponentenzustand mit Backoff; nur echte Integritätsfehler (`installation_mismatch`,
Migrationsprüfung) beenden bewusst.
**Tests:** Fehlerinjektion je Exception-Typ → App bleibt live, Readiness/Komponente zeigt Grund.

---

### OPUS-A1-014 · MEDIUM · Ein unparsebares `device_timestamp`-Attribut legt den HA-Adapter lahm

**Bereich:** [`src/core_contracts/adapters/ha.py:18-21`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L18-L21), [`85`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L85), [`103-135`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L103-L135), [`207-214`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L207-L214).

**Beobachtung:** `timestamp()` wirft `ValueError` bei nicht-ISO oder naiver Zeit; der Fehler steigt
aus `observation()` auf, beendet die Verbindung, erzeugt eine Gap und wiederholt sich nach 2 s mit
demselben Snapshot (R10 bestätigt `ValueError`).
**Warum problematisch:** Eine einzige Entity mit einem gleichnamigen Fremdattribut blockiert alle
HA-Sources dauerhaft und erzeugt die Gap-Flut aus 004. Der Attributname ist fest im Code, nicht
pro Binding konfiguriert.
**Korrektur:** Parsefehler pro Observation abfangen (`availability=unknown`, `invalid_value`);
Gerätezeit-Attribut nur über die Binding-Konfiguration aktivieren.
**Tests:** Snapshot mit ungültigem `device_timestamp` → betroffene Source `unknown`, andere valid,
Verbindung bleibt bestehen.

---

### OPUS-A1-015 · MEDIUM · Lost Wakeup bei Revisionswechsel während des HA-Handshakes

**Bereich:** [`src/core_contracts/adapters/ha.py:146-179`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L146-L179), [`201-208`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L201-L208).

**Beobachtung:** `connect(config)` erhält die Konfiguration vor dem Handshake; nach dem Subscribe
werden `revision_changed` und `resubscribe` gelöscht. Eine Aktivierung während des Handshakes wird
dadurch verschluckt; die Subscription bleibt auf der alten Entity-Liste. `resubscribe` wird
zwischen HA- und MQTT-Adapter geteilt und vom HA-Adapter gelöscht.
**Folge:** Neue Bindings erhalten bis zum nächsten zufälligen Reconnect keine Daten (ohne Diagnose).
**Korrektur:** Revision vor dem Löschen vergleichen (aktive Revision ≠ verwendete → sofort
neu verbinden) bzw. Events vor dem Lesen der Konfiguration löschen; getrennte Events je Adapter.
**Tests:** Aktivierung zwischen `info` und `subscribe` → zweite Subscription mit neuer Liste.

---

### OPUS-A1-016 · MEDIUM · Snapshot-Größe durch Queue begrenzt; Processor-`await` blockiert die HA-Leseschleife

**Bereich:** [`src/core_contracts/adapters/ha.py:107-116`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L107-L116), [`186-194`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L186-L194), [`src/core_contracts/runtime.py:67`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L67), [`164-175`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L164-L175).

**Beobachtung:** Der Snapshot wird per `put_nowait` in eine 256er-Queue (geteilt mit Ticks)
eingespeist; mehr Bindings als freie Plätze → Overflow → Resubscribe → neuer Snapshot → erneut
Overflow (Endlosschleife). `await submit("snapshot_complete")` und jede Eventverarbeitung laufen in
der WS-Leseschleife; bei langsamem Processor (001) staut sich HAs Sendepuffer, bis HA die Verbindung
trennt.
**Bewertung:** Für Phase 1 mit wenigen Bindings unkritisch; strukturell verhindert es Phase 2 mit
größeren Registries und verschärft 001.
**Korrektur:** Snapshot als ein Arbeitselement übergeben; Lesen und Verarbeiten entkoppeln.
**Tests:** Snapshot mit > Queue-Größe Bindings → genau ein Snapshot, keine Overflow-Gap.

---

### OPUS-A1-017 · MEDIUM · `state_reported` wird für alle Bindings abonniert und verarbeitet

**Bereich:** [`custom_components/core_contracts_bridge/__init__.py:76-77`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L76-L77), [`src/core_contracts/adapters/ha.py:120-135`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/adapters/ha.py#L120-L135),
[`src/core_contracts/runtime.py:339-382`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L339-L382).

**Beobachtung:** Nach Behebung von 002 erzeugt jeder Report jeder Entity einen Processor-Schritt
mit Commit und Publication, auch für `event_stateful`-Sources, bei denen Reports keine Rolle spielen.
**Folge:** Unnötiger WS- und DB-Traffic von häufig meldenden Sensoren (Prüfauftrag §14
„unnötiger `state_reported`-Traffic“); verstärkt 001.
**Korrektur:** Report-Abonnement je Entity nur bei `report_heartbeat`/`liveness_source`
anfordern (Protokollfeld) und Reports ohne Wirkung nicht publizieren (siehe 001).
**Tests:** `event_stateful`-Binding erhält keine Reports; Heartbeat-Binding schon.

---

### OPUS-A1-018 · MEDIUM · Validierungsfehler erreichen den Administrator nicht

**Bereich:** [`src/core_contracts/api.py:62-78`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L62-L78), [`frontend/src/api.ts`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/frontend/src/api.ts) (`request`), [`frontend/src/App.svelte`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/frontend/src/App.svelte).

**Beobachtung:** Bis auf vier Codes wird jede `ValueError`/`ValidationError` zu
`invalid_request`; die UI zeigt nur „Anfrage fehlgeschlagen (400)“.
**Folge:** G3-UI-Smoke kann fehlerhafte Drafts nicht diagnostizieren („Validierung mit Diff“, §10.3/§26).
**Korrektur:** Fixe Validierungscodes und Pydantic-`loc`/`type` (ohne `input_value`) zurückgeben und
in der UI anzeigen.
**Tests:** Zyklus, ungebundene Source, fehlender Parameter → spezifischer Code in API und UI.

---

### OPUS-A1-019 · MEDIUM · Testnachweise für kritische Pfade fehlen oder sind irreführend

**Bereich:** [`dev/fake_ha.py`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/dev/fake_ha.py), [`tests/test_transports.py`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/tests/test_transports.py), [`tests/test_runtime.py:87-101`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/tests/test_runtime.py#L87-L101),
[`tests/test_restore.py:131-143`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/tests/test_restore.py#L131-L143), [`docs/platform-alpha1/completion-report.md`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/docs/platform-alpha1/completion-report.md).

**Beobachtung:** siehe Abschnitt Tests/CI — Bridge nie ausgeführt; kein Soak; Overflow-Test prüft
den DB-aus-Pfad; Restore von Grace/Kontinuität ohne Neustartpfad; Deadline-Test grün aus anderem
Grund; kein Crash-nach-Commit; kein SIGTERM mit WS.
**Warum problematisch:** Die grünen Tests belegen G2/G6/G11 nicht in der behaupteten Breite;
001–005 wären mit den fehlenden Tests gefunden worden.
**Korrektur:** Die je Befund genannten Tests ergänzen; Abschlussbericht für G2/G6/G11 korrigieren.

---

### OPUS-A1-020 · MEDIUM · Stale Advisory-Lock nach Netzwerk-Partition blockiert Recovery

**Bereich:** [`src/core_contracts/persistence.py:86-99`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L86-L99), [`src/core_contracts/app.py:183-193`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L183-L193).

**Beobachtung:** Ohne TCP-Keepalive-/Session-Timeouts kann die alte Server-Session nach einer
Partition (bei bewusst akzeptierter WAN-Kopplung, §12.1) den Advisory-Lock halten, bis PostgreSQL
den toten Peer erkennt (Linux-Default ~2 h). Recovery meldet bis dahin `writer_lock_unavailable`.
**Status:** plausibel aus Code + PG-Verhalten; Realnachweis offen.
**Korrektur:** `server_settings` bzw. Verbindungsparameter für `tcp_keepalives_*` setzen und
`idle_session_timeout`/`idle_in_transaction_session_timeout` dokumentieren; Diagnose zeigt Lock-Halter.
**Tests:** Partition per Netzwerk-Unterbrechung im Docker-Smoke.

---

### OPUS-A1-021 · LOW · Doppelpfad-Erkennung nur über frei deklarierten `physical_source_key`

**Bereich:** [`src/core_contracts/registry.py:157-164`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/registry.py#L157-L164).
Zwei Sources mit unterschiedlichen Schlüsseln auf **dieselbe** Entity/dasselbe Topic werden
akzeptiert. **Korrektur:** zusätzlich identische Adapter-Adressen ablehnen. **Test:** zwei
Bindings auf `sensor.example_1` → Ablehnung.

### OPUS-A1-022 · LOW · Readiness-Gate „erster Bridge-Snapshot der Epoche“ wird nicht je Epoche zurückgesetzt

**Bereich:** [`src/core_contracts/runtime.py:71`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L71), [`238-241`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L238-L241). Nach DB-Recovery (neue Epoche) ist
`ready` ohne neuen Snapshot sofort wieder wahr (§21). **Korrektur:** bei Epochenwechsel
zurücksetzen. **Test:** Recovery → `first_bridge_snapshot_pending` bis Snapshot.

### OPUS-A1-023 · LOW · `database_older_than_last_shutdown` nur als Warnung; `publication_seq` kann nach PG-Restore wiederverwendet werden

**Bereich:** [`src/core_contracts/app.py:140-145`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L140-L145). §15.4 verlangt `publication_seq` monoton und
epochenübergreifend. **Korrektur:** Seq auf mindestens den vermerkten Wert anheben und Gap-Grund
`database_older_than_last_shutdown` schreiben. **Test:** älterer Dump + neuere Shutdown-Datei.

### OPUS-A1-024 · LOW · Pflicht-Logereignisse fehlen; Textformat verliert alle Felder

**Bereich:** [`src/core_contracts/app.py:52-65`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L52-L65), [`108-115`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/app.py#L108-L115). Nicht geloggt: Aktivierung/Rollback,
Migrationen, Übergänge nach/aus `unknown`/`unresolved`, abgelehnte Commands (§22). Im Format `text`
fehlen `installation_id`/`epoch_id` im Start-Log (§11). **Korrektur:** Ereignisse ergänzen, Extras
im Textformat ausgeben.

### OPUS-A1-025 · LOW · Bridge-Lebenszyklus

**Bereich:** [`custom_components/core_contracts_bridge/__init__.py:93-94`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L93-L94), [`107-113`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/custom_components/core_contracts_bridge/__init__.py#L107-L113). WS-Kommandos
bleiben nach Unload registriert; `async_on_unload` sammelt je Subscription einen Callback; keine
`translations/en.json` für den Config-Flow; Bridge nicht typgeprüft. **Korrektur:** Unsubscribe
über `connection.subscriptions` genügt; Reload-Callback einmal je Entry; Übersetzungen ergänzen.

### OPUS-A1-026 · LOW · Admin-UI: irreversible Aktionen ohne Bestätigung, deaktivierte Contracts unsichtbar

**Bereich:** [`frontend/src/App.svelte`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/frontend/src/App.svelte). Token-Rotation invalidiert sofort alle Consumer;
Rollback ohne Rückfrage; `enabled=false` erscheint nirgends; Validierungsfehler setzt den globalen
Dienststatus auf „Fehler“. **Korrektur:** Bestätigungsdialoge, Anzeige deaktivierter Instanzen
aus der aktiven Revision, getrennter Validierungsstatus.

### OPUS-A1-027 · LOW · Rate-Limit nach Authentifizierung, gemeinsamer Schlüssel je Quell-IP

**Bereich:** [`src/core_contracts/api.py:41-52`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L41-L52). 401-Versuche werden nicht begrenzt (bei 256-Bit-Token
geringes Risiko); alle Consumer aus HA-Core teilen sich 120 Anfragen/min (Phase-2-Engpass).

### OPUS-A1-028 · LOW · Fixture-SM nutzt `deadline_overdue_unprocessed` für jede nicht akzeptierte fällige Deadline; Test grün aus falschem Grund

**Bereich:** [`src/core_contracts/testing/contract_types/evaluate.py:139-155`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/testing/contract_types/evaluate.py#L139-L155), [`tests/test_restore.py:131-143`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/tests/test_restore.py#L131-L143).
R9: Zustand `a` mit erfülltem Guard → ebenfalls `unknown/deadline_overdue_unprocessed`, weil `a`
keine Deadline-Transition hat und die Initial-Deadline nie als verarbeitet markiert wird.
§9.1 reserviert den Reason für unbestimmbaren Verarbeitungsstand. **Korrektur:** Fixture-Semantik
präzisieren; Test mit Gegenfall (Guard erfüllt in `b` → `c`).

### OPUS-A1-029 · LOW · `Reason.input` benennt teils den Operator statt des betroffenen Inputs

**Bereich:** [`src/core_contracts/resolver.py:33`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/resolver.py#L33), [`61`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/resolver.py#L61), [`69`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/resolver.py#L69), [`src/core_contracts/fusion.py:28`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/fusion.py#L28),
[`35`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/fusion.py#L35). Upstream-Reasons gehen in diesen Zweigen verloren (§7.1 „Reason + betroffener Input“).

### OPUS-A1-030 · LOW · Client: Endlos-Retry bei Auth-Fehlern, ungefangene JSON-Fehler

**Bereich:** [`client/core_contracts_client/__init__.py:135-168`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/client/core_contracts_client/__init__.py#L135-L168). 401/403 beim WS-Handshake →
Retry alle 1 s ohne Ende; ungültiges JSON beendet den Iterator. **Korrektur:** Auth-Fehler
terminal, Backoff mit Jitter.

### OPUS-A1-031 · LOW · `history/{id}` „letzte 100“ beruht auf ungeordnetem DB-Laden

**Bereich:** [`src/core_contracts/persistence.py:163`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/persistence.py#L163), [`src/core_contracts/api.py:191-197`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/api.py#L191-L197).
`SELECT` ohne `ORDER BY` → nach Neustart nicht garantiert die neuesten 100. Mit 001 zusammen lösen.

### OPUS-A1-032 · LOW · `tzdata`-Pin möglicherweise wirkungslos

**Bereich:** [`core_contracts/Dockerfile`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/core_contracts/Dockerfile), [`src/core_contracts/clock.py:108`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/clock.py#L108). `zoneinfo` bevorzugt
System-Zonendaten (`TZPATH`) vor dem Python-Paket `tzdata`; bringt das Basisimage
`/usr/share/zoneinfo` mit, gilt der Pin aus §18 nicht. **Prüfen** und ggf. `PYTHONTZPATH=` setzen.

### Notes (ohne Pflichtfix)

- **N-01** Grace hält auch bei `not_applicable`-Input den letzten Wert (Fixture-Ebene).
- **N-02** Source-Fingerprints enthalten **alle** Kataloge → jede Katalogänderung setzt alle
  Baselines zurück (konservativ, aber breit).
- **N-03** Der AST-Scope-Wächter prüft nur Konstanten mit `<term>.v`-Präfix; die
  Laufzeit-Erzwingung in `TypeRegistry.register` und der exakte Typmengentest sind die tragende
  Absicherung.
- **N-04** GitHub Actions per Tag statt SHA gepinnt.
- **N-05** MQTT ohne TLS-Option; leerer externer Benutzername wird als `""` übergeben.
- **N-06** Die Runtime kennt die Fixture-Node-Schlüssel `temporal`/`machine` ([`runtime.py:147-149`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L147-L149),
  [`328-331`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L328-L331), [`556`](https://github.com/Levtos/core_contract_app/blob/db85981d2c282b9d597a806fc07022e08f97c802/src/core_contracts/runtime.py#L556)) und wertet nur ein Feld `value` je Contract aus — für Phase 2 (mehrfeldige
  Schemas) generalisieren.
- **N-07** Lesepool wird erzeugt, aber nicht genutzt; Commit führt mehrere Roundtrips je Zeile aus
  (relevant bei WAN-DB).
- **N-08** `physical_state` hat keine Laufzeitwirkung; mangels Ersatzwert-Mechanismus ist „reject“
  inhärent erfüllt.

---


---

Source: https://github.com/levtos/core_contract_app/pull/2#issuecomment-6054558966
Author: levtos-claude
Updated: 2026-10-08T07:08:53Z

> **Opus Pre-Install-Review · PR #2 · Teil 3/3** · Urteil **`READY FOR PRE-INSTALL REMEDIATION`** · Commit `db85981` · Fortsetzung von Teil 1: [Teil 1](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054556193)

## Positive Confirmations

Diese Bereiche sind nach eigener Prüfung korrekt und müssen nicht grundlos erneut geöffnet werden:

1. **Scope-Trennung:** ausschließlich `test.*`/`fixture`, laufzeitseitig erzwungen; keine
   Domain-Semantik, keine Profile, kein Default-Kontext, kein Shadow, kein `set_state`.
2. **Quality-Modell:** fünf Status mit harten Invarianten im Modellvalidator; Laufzeit-Revalidierung;
   Held-Propagation mit frühestem Ende, keine Grace-Ketten, kein Erneuern abgelaufener Grace.
3. **Resolver/Fusion:** dreiwertige Logik, strenges `first_match` → `unresolved`, `map` →
   `unmapped_value`, `bucket` mit Pflicht-`initial`, Latch-Reset bei ungültigem Input, Latch nicht
   persistiert und fingerprintgebunden; Fusion mit Konflikt, Teil-Evidence, Erweiterungspunkt.
4. **Evidence-Funktionen:** Empfangszeit ≠ Messzeit, fehlende Messzeit ist hartes Gate,
   `last_updated` allein nicht neu, Zukunftstoleranz, Retain nie positiv.
5. **Commit-before-publish:** sichtbarer Zustand, Deltas, Command-Acks und Latch-Übernahme erst nach
   erfolgreichem Commit; fehlgeschlagener Commit → keine Publication, kein Ack,
   `publication_confirmed=false`; In-doubt-Commit wird durch Reload bei Recovery konsistent aufgelöst.
6. **Writer-Lock und Migrationen:** dedizierte Writer-Verbindung, exklusiver Advisory-Lock mit
   Besitzprüfung pro Commit, zweite Instanz abgewiesen, Lock-Verlust blockiert Commit;
   Checksummen-/Neuere-Schema-Schutz; Migrationen unter Lock.
7. **DB-Ausfall-Grundmechanik:** eingefrorene Fortschreibung, nur letzte Observation je Binding,
   Recovery mit Reload, neuer Epoche, `history_gap(db_outage)` und `resync_required`, Liveness
   bleibt grün (Docker-Smoke).
8. **Registry:** stabile IDs, Entity-IDs nur in Bindings, geschlossene Modelle, OCC für Drafts und
   Aktivierung, Rollback als neue Revision, Drafts nie ausgewertet, Fingerprints ohne Anzeigenamen.
9. **`installation_id`:** vollständige Fallmatrix, UUIDv4-Prüfung, erneute Prüfung bei Recovery,
   nicht in IDs/Zeilen.
10. **Commands:** stabile ID, Digest-Idempotenz, Konflikt, Gültigkeitsfenster, Wirkung + Ergebnis in
    einem Commit, keine Wiederholung nach Restart.
11. **API-/WS-Grenze:** zwei Listener, Ingress-Peer-Prüfung ohne Header-Vertrauen, Tokens 256 Bit/0600
    mit konstantem Vergleich, Größenlimits, atomarer Snapshot, `prev_seq`-Kette, begrenzte
    Subscriber-Queues mit Resync.
12. **Client:** explizite Identität ohne Defaults, korrekter Resync ohne doppelte/verlorene Deltas,
    Command-Antwortverlust über stabile ID.
13. **Bridge-Architektur:** wirklich dünn, gefilterte Listener, Snapshot und Listener atomar im
    selben Callback (der Fehler 002 ist ein Feldname, keine Architekturfrage).
14. **Container/Supervisor-Konfiguration:** explizites Python-3.14-Image, frozen Dependencies,
    non-root via `setpriv`, Watchdog/HEALTHCHECK nur Liveness, keine erweiterten Rechte.
15. **Zeitmodell:** Clock-Interface mit Ruff-Bann direkter Zeitzugriffe, FakeClock mit Sprüngen,
    absolute UTC-Fristen, DST-Konvention getestet, monotone Werte nie persistiert.
16. **CI:** vollständig wirksam, keine Umgehungen; Behauptungen zur Testanzahl stimmen.

---

## Pre-Install Fixes

**Zwingend vor der ersten realen Installation:**

| Prio | Befund | Kern der Korrektur |
|---|---|---|
| 1 | OPUS-A1-001 | Publication/History nur bei Änderung; fällige statt aller Contracts auf Timer; Changeset-Persistenz ohne History im RAM |
| 2 | OPUS-A1-002 | `event.data["last_reported"]`; Bridge im echten HA-Testkern testen |
| 3 | OPUS-A1-003 | Verfügbarkeits-/Restored-Wechsel nie verwerfen |
| 4 | OPUS-A1-004 | Eine Gap pro Disconnect, Anker nur betroffener Contracts, Backoff, MQTT-Invalid als Observation |
| 5 | OPUS-A1-005 | Grace nur aus zuletzt ausgewertetem `valid`; `last_valid` bei Restore/Gap verwerfen |

**Dringend empfohlen (gleiche Runde, geringer Aufwand):** 011, 012, 013, 014 (Stabilität der
Installation), 008, 009, 006, 010 (Restore/Overflow-Semantik), 017 (Report-Traffic), 018
(UI-Smoke-Fähigkeit), 019 (Tests). 015, 016, 020 können parallel erfolgen.

**Zusätzlich vor Installation automatisierbar (Prüfauftrag §26):**
- Bridge + App gegen einen echten HA-Dev-Container in CI (state_changed, state_reported,
  Integrations-Reload mit `restored`, HA-Neustart) — §28 sieht das „falls verfügbar“ vor.
- Docker-Build aus dem **gestagten** App-Verzeichnis als Kontext (wie Supervisor), nicht nur vom
  Repo-Root.
- Soak-Test (Stunden in FakeClock-Zeit) gegen PostgreSQL mit Zeilen- und Latenzgrenzen.
- SIGTERM-Smoke mit offener WS-Verbindung; Startup-Smoke mit großer Historie (Liveness durchgehend).
- arm64-Container-Smoke unter QEMU (langsam, aber machbar).
- hassfest/HACS-Action für die Bridge.

---

## Real-HA Verification Remaining

Nach den Fixes weiterhin nur real nachweisbar (Bennis Gate):

1. Supervisor-Installation aus dem gestagten lokalen Repository; Build-Dauer und Ressourcen auf dem
   HA-Host (Node/uv-Build), Prozess-UID, `/data`-Rechte (G1).
2. Admin-WS-Recht des Supervisor-Users für `core_contracts_bridge/*` (G2).
3. Echte `state_reported`-Last, Sendepuffer, Reihenfolge; Integrations-Reload (`restored`) und
   HA-Neustart mit Gap/Snapshot (G2).
4. Ingress-Peer-Adresse und Admin-UI-Smoke: Import, Validierung, Aktivierung, Rollback, Tokens (G3).
5. MQTT über Services-API (`mqtt:want`, Modus `supervisor`).
6. Supervisor-Watchdog bei DB-Trennung (Readiness rot, Liveness grün, kein Neustart) (G10).
7. SIGTERM über `init: true` mit geöffneter Admin-UI (< 30 s) (G10).
8. TLS `verify-full` mit CA unter `/ssl`; Netzwerk-Partition zur DB (020).
9. Konsistentes Backup/Restore `/data` + PG-Dump inklusive `database_older_than_last_shutdown`.
10. Interner App-Hostname für spätere Consumer.

---

## Final Verdict

**`READY FOR PRE-INSTALL REMEDIATION`**

Begründung: Die Plattform ist im Sinne der Spezifikation gebaut — Scope, Ownership,
Quality-Modell, Registry-/Revisionsmodell, Installation Identity, No-Shadow, Thin Bridge,
PostgreSQL mit Commit-before-publish, Writer-Lock und Client-Grenze sind korrekt angelegt und
mehrheitlich gut belegt. Eine fundamentale Abweichung, die eine Neukonzeption erfordern würde,
liegt nicht vor; deshalb nicht `NOT ACCEPTABLE`.

Für `READY FOR REAL HA VERIFICATION` fehlen jedoch die Voraussetzungen: Zwei BLOCKER würden eine
reale Installation nachweislich destabilisieren bzw. die Bridge-Abnahme unmöglich machen (001, 002),
und drei HIGH-Befunde verletzen Evidence- und Restore-Regeln im realen Datenpfad (003, 004, 005).
Alle Korrekturen sind lokal in `runtime.py`, `persistence.py`, `temporal.py`, den Adaptern und der
Bridge möglich. Codex/Astra soll jeden Befund unabhängig nachprüfen und nur bestätigte Befunde
korrigieren; danach erneuter kurzer Review der geänderten Pfade, dann Bennis reale Abnahme.

---

### Anhang: Reproduktion

Skript außerhalb des Repositorys gegen den unveränderten Commit `db85981`
(`uv run --project <clone> python repro.py <clone>`), MemoryStore + FakeClock, keine externe
Verbindung. Szenarien R1–R10 entsprechen den Befunden 001, 003, 008, 009, 010, 005, 006, 004, 028,
014. Vollständige Ausgabe:

```
[R1] ticks=1200 seq=1201 history_rows=6005 publications=1201 tick_ms=240.24
[R2] before: valid True | after restored-unavailable event: valid True | stored availability: available
[R3] after one tick: {'ever_active': True, 'enabled': False} | enabled SM: start_case 'missing', unknown ['restore_context_missing']
[R4] after revision + 3 inputs/ticks: unknown ['restore_context_missing']
[R5] gaps before/after: 0 0 | latest buffered: 0 | overflow flag: False | stored obs value: None
[R6] 1 h later, unknown live change: held True held_until 2026-01-01T13:01:01Z
[R7] anchor before/after overflow: 12:00:00Z / 12:00:00Z | 60 s later: valid True
[R8] HA source continuously true for 20 s: False | gaps: 10
[R9] guard input a=True: unknown ['deadline_overdue_unprocessed']
[R10] raised ValueError -> disconnect + gap + reconnect loop
```

Externe Quellen (read-only, Permalinks):
- HA-Core: [`EventStateReportedData`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/core.py#L146-L154), [`async_set_internal`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/core.py#L2479-L2491), [`helpers/event.py` Dispatcher](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/event.py#L344), [`Entity.async_remove`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/entity.py#L1494-L1549), [`RegistryEntry.write_unavailable_state`](https://github.com/home-assistant/core/blob/803d2e5d79aa2a917ecaf5132650f5c79ddfbb00/homeassistant/helpers/entity_registry.py#L477-L502)
- aiohttp 3.14.4: [`BaseRunner`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/web_runner.py#L263-L277), [`cleanup`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/web_runner.py#L316-L331), [`TimerContext`](https://github.com/aio-libs/aiohttp/blob/v3.14.4/aiohttp/helpers.py#L705-L759)

<details><summary>Reproduktionsskript R1–R10 (unverändert ausgeführt gegen <code>db85981</code>)</summary>

Aufruf: `uv run --project <clone> python -u repro.py <clone>` — nutzt nur `MemoryStore` und `FakeClock`, keine Netzwerk- oder DB-Verbindung, schreibt nichts ins Repository.

```python
"""Independent reproduction of review findings. Runs against the PR checkout (no code changes)."""

import asyncio
import copy
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(sys.argv[1])
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "client"), str(ROOT)]

from core_contracts.adapters.ha import BridgeAdapter  # noqa: E402
from core_contracts.clock import FakeClock  # noqa: E402
from core_contracts.evidence import Observation  # noqa: E402
from core_contracts.persistence import MemoryStore  # noqa: E402
from core_contracts.registry import validate  # noqa: E402
from core_contracts.runtime import Runtime  # noqa: E402
from core_contracts.testing.contract_types import type_registry  # noqa: E402

T0 = datetime(2026, 1, 1, 12, tzinfo=UTC)


def base_config(type_id="test.echo", parameters=None, enabled=True, freshness=None):
    return {
        "config_schema_version": 1,
        "dependencies": [{"dependency_id": "dep.test", "kind": "ha", "monitor": "internal"}],
        "sources": [
            {
                "source_id": "source.a",
                "source_type": "boolean",
                "source_origin": "local",
                "freshness": freshness or {"mode": "event_stateful", "future_tolerance_s": 1},
                "dependency_id": "dep.test",
                "physical_source_key": "physical.a",
            }
        ],
        "bindings": [
            {
                "binding_id": "binding.a",
                "source_id": "source.a",
                "adapter": {"kind": "ha_state", "ha_entity_id": "sensor.example_1"},
            }
        ],
        "contracts": [
            {
                "contract_id": "fixture.x",
                "type_id": type_id,
                "type_version": 1,
                "enabled": enabled,
                "inputs": [{"name": "a", "ref": "source.a"}],
                "parameters": parameters or {},
            }
        ],
        "catalogs": [],
    }


def obs(rt, value=True, kind="live_change", changed=None, **kw):
    now = rt.clock.now_utc()
    return Observation(
        source_id="source.a",
        binding_id="binding.a",
        adapter="ha_state",
        value_raw=value,
        observation_kind=kind,
        ha_time_fired=now,
        ha_last_changed=changed or now,
        received_at=now,
        epoch_id=rt.state.epoch_id,
        ingest_seq=1,
        **kw,
    )


async def new_runtime(store=None):
    rt = Runtime(store or MemoryStore(), FakeClock(T0), type_registry())
    await rt.start()
    return rt


async def activate(rt, config):
    draft = await rt.submit("draft_create", {"config": config})
    return await rt.submit(
        "activate", {**draft, "expected_active_revision": rt.state.active_revision}
    )


def field(rt, cid="fixture.x"):
    env = rt.snapshot()["contracts"].get(cid)
    return env and env["fields"]["value"]


async def r1_growth():
    print("\n[R1] tick-driven growth with the 5-contract example registry")
    rt = await new_runtime()
    reg = json.loads((ROOT / "docs/platform-alpha1/example-registry.json").read_text())
    await activate(rt, reg)
    rows = []
    for n in range(1, 1201):
        rt.clock.advance(0.5)
        t = time.perf_counter()
        await rt.submit("tick")
        dt = time.perf_counter() - t
        if n in (1, 100, 300, 600, 900, 1200):
            rows.append(
                (
                    n,
                    rt.state.publication_seq,
                    len(rt.state.tables["contract_state_history"]),
                    len(rt.state.publications),
                    round(dt * 1000, 2),
                )
            )
    for r in rows:
        print("  ticks=%5d seq=%5d history_rows=%6d publications=%5d tick_ms=%7.2f" % r)
    await rt.stop()


async def r2_restored_dropped():
    print("\n[R2] live state_changed with restored:true / unavailable is dropped")
    rt = await new_runtime()
    await activate(rt, base_config())
    await rt.submit("observation", obs(rt, True))
    print("  before:", field(rt)["status"], field(rt)["value"])
    rt.clock.advance(5)
    restored = obs(rt, "unavailable", ha_restored=True).model_copy(
        update={"availability": "unavailable", "value_raw": "unavailable"}
    )
    await rt.submit("observation", restored)
    stored = rt.state.tables["source_observation_current"]["binding.a"]
    print("  after restored-unavailable event:", field(rt)["status"], field(rt)["value"],
          "| stored availability:", stored["availability"])
    await rt.stop()


async def r3_ever_active():
    print("\n[R3] never-active disabled contract becomes ever_active=True")
    rt = await new_runtime()
    await activate(rt, base_config(enabled=False))
    print("  after activation:", rt.state.tables["contract_lifecycle"]["fixture.x"])
    await rt.submit("tick")
    print("  after one tick:  ", rt.state.tables["contract_lifecycle"]["fixture.x"])
    await activate(rt, base_config(type_id="test.state_machine",
                                   parameters={"deadline_s": 30, "sessions": False}))
    print("  enabled SM start_case:", rt.state.tables["contract_lifecycle"]["fixture.x"],
          "| field:", field(rt)["status"], [r["code"] for r in field(rt)["reasons"]])
    await rt.stop()


async def r4_sm_stuck():
    print("\n[R4] state machine after parameter change / re-enable")
    rt = await new_runtime()
    await activate(rt, base_config("test.state_machine", {"deadline_s": 300, "sessions": False}))
    await rt.submit("observation", obs(rt, True))
    print("  initial:", field(rt)["status"], field(rt)["value"])
    await activate(rt, base_config("test.state_machine", {"deadline_s": 600, "sessions": False}))
    for i in range(3):
        rt.clock.advance(1)
        await rt.submit("observation", obs(rt, i % 2 == 0))
        await rt.submit("tick")
    f = field(rt)
    print("  after revision + 3 inputs/ticks:", f["status"], [r["code"] for r in f["reasons"]])
    await rt.stop()


async def r5_overflow_lost():
    print("\n[R5] overflow gap + coalesced observation lost when next work item does not commit")
    rt = await new_runtime()
    cfg = base_config()
    await activate(rt, cfg)
    gaps_before = len(rt.state.tables["history_gap"])
    rt.overflow = True
    rt.latest["binding.a"] = obs(rt, False)
    await rt.submit("validate", cfg)
    print("  gaps before/after:", gaps_before, len(rt.state.tables["history_gap"]),
          "| latest buffered:", len(rt.latest), "| overflow flag:", rt.overflow,
          "| stored obs value:", rt.state.tables["source_observation_current"].get("binding.a", {}).get("value_raw"))
    await rt.stop()


async def r6_grace_after_gap():
    print("\n[R6] grace started from a pre-gap last_valid")
    rt = await new_runtime()
    await activate(rt, base_config("test.temporal",
                                   {"operation": "grace", "duration_s": 60, "accepts_held": False}))
    await rt.submit("observation", obs(rt, True))
    print("  valid:", field(rt)["status"], field(rt)["value"])
    await rt.submit("bridge_state", ("unavailable", "disconnected"))
    await rt.submit("gap", "ha_disconnect")
    print("  after bridge loss (origin revision):", field(rt)["status"])
    rt.clock.advance(3600)
    snap = obs(rt, "unavailable", kind="snapshot").model_copy(update={"availability": "unavailable"})
    await rt.submit("observation", snap)
    rt.clock.advance(1)
    live = obs(rt, "unknown").model_copy(update={"availability": "unknown"})
    await rt.submit("observation", live)
    f = field(rt)
    print("  1 h later, unknown live change:", f["status"], f["value"], "held_until", f["held_until"])
    await rt.stop()


async def r7_overflow_continuity():
    print("\n[R7] ingest overflow keeps stable_for anchor (no continuity proof)")
    rt = await new_runtime()
    await activate(rt, base_config("test.temporal",
                                   {"operation": "stable_for", "duration_s": 60, "accepts_held": False}))
    await rt.submit("observation", obs(rt, True))
    anchor = rt.state.tables["node_state"]["fixture.x"]["temporal"]["since_at"]
    rt.clock.advance(12)
    # intermediate false/true lost in overflow; only the latest (true, changed now) is coalesced
    rt.overflow = True
    rt.latest["binding.a"] = obs(rt, True, kind="live_change")
    await rt.submit("tick")
    print("  anchor before:", anchor, "after overflow:",
          rt.state.tables["node_state"]["fixture.x"]["temporal"]["since_at"])
    rt.clock.advance(48)
    await rt.submit("tick")
    print("  60 s after original anchor:", field(rt)["status"], field(rt)["value"])
    await rt.stop()


async def r8_gap_resets_all():
    print("\n[R8] any adapter gap resets every temporal anchor")
    rt = await new_runtime()
    await activate(rt, base_config("test.temporal",
                                   {"operation": "stable_for", "duration_s": 10, "accepts_held": False}))
    await rt.submit("observation", obs(rt, True))
    for _ in range(10):
        rt.clock.advance(2)
        await rt.submit("gap", "mqtt_disconnect")  # e.g. broker down, retry loop every 2 s
        await rt.submit("tick")
    print("  HA source continuously true for 20 s:", field(rt)["value"],
          "| gaps:", len(rt.state.tables["history_gap"]))
    await rt.stop()


async def r9_deadline_state_a():
    print("\n[R9] fixture SM: due deadline in state a with satisfied guard")
    rt = await new_runtime()
    await activate(rt, base_config("test.state_machine", {"deadline_s": 1, "sessions": False}))
    await rt.submit("observation", obs(rt, True))
    rt.clock.advance(2)
    await rt.submit("tick")
    f = field(rt)
    print("  guard input a=True:", f["status"], [r["code"] for r in f["reasons"]])
    await rt.stop()


def r10_device_timestamp():
    print("\n[R10] unparsable 'device_timestamp' attribute raises out of the adapter")
    cfg = validate(base_config(), type_registry())

    class Dummy:
        clock = FakeClock(T0)

        class state:
            epoch_id = "e"

    adapter = BridgeAdapter(Dummy(), None, "ws://x", "t")
    try:
        adapter.observation(
            cfg.bindings[0],
            {"state": "on", "attributes": {"device_timestamp": "yesterday"},
             "last_changed": T0.isoformat(), "last_updated": T0.isoformat()},
            "snapshot", {}, cfg,
        )
        print("  no exception")
    except Exception as error:  # noqa: BLE001
        print("  raised", type(error).__name__, "-> caught by run() -> disconnect + gap + reconnect loop")


async def main():
    await r1_growth()
    await r2_restored_dropped()
    await r3_ever_active()
    await r4_sm_stuck()
    await r5_overflow_lost()
    await r6_grace_after_gap()
    await r7_overflow_continuity()
    await r8_gap_resets_all()
    await r9_deadline_state_a()
    r10_device_timestamp()


asyncio.run(main())
```

</details>


---

Source: https://github.com/levtos/core_contract_app/issues/1#issuecomment-6054574153
Author: levtos-claude
Updated: 2026-10-08T07:09:41Z

## Unabhängiger Opus-Pre-Install-Review zu PR #2 — Urteil: `READY FOR PRE-INSTALL REMEDIATION`

**Vollständiger Bericht:** [PR #2 · Teil 1 (Übersicht, Bereiche, G1–G15)](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054556193) · [Teil 2 (Findings OPUS-A1-001…032)](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054558431) · [Teil 3 (Positives, Pre-Install-Fixes, Real-HA-Restpunkte, Reproduktion)](https://github.com/Levtos/core_contract_app/pull/2#issuecomment-6054558966)

Geprüft: Commit [`db85981`](https://github.com/Levtos/core_contract_app/commit/db85981d2c282b9d597a806fc07022e08f97c802) (unveränderter PR-Head), gegen Build-Spezifikation und Codex-Build-Prompt. Read-only: keine Codeänderung, kein Commit, kein Merge, kein Release, keine Installation.

**Kurzfassung:** Architektur und Scope entsprechen der Spezifikation (nur `test.*`, keine Profile/kein Shadow, Commit-before-publish, Writer-Lock, Registry-OCC, Installation Identity, dünne Bridge). CI-Angaben bestätigt (86/86, Ruff, mypy strict, Multi-Arch-Build). Vor einer realen Installation sind zu beheben:

| ID | Schwere | Kern |
|---|---|---|
| OPUS-A1-001 | BLOCKER | 0,5-s-Tick publiziert immer neu, schreibt History je Contract, klont den Gesamtzustand → linear wachsende Latenz (240 ms/Tick nach 10 min), RAM/DB unbegrenzt |
| OPUS-A1-002 | BLOCKER | Bridge liest `new_last_reported` — existiert in HA nicht → Exception je `state_reported`, keine Reports in der App |
| OPUS-A1-003 | HIGH | `restored`/`unavailable`-Live-Events (HA-Integrations-Reload) werden verworfen → Contract bleibt `valid` |
| OPUS-A1-004 | HIGH | Gap pro Retry (2 s) und globaler Reset aller Temporal-Anker |
| OPUS-A1-005 | HIGH | Grace startet nach Lücke/Neustart aus veraltetem `last_valid` |

Weitere 15 MEDIUM, 12 LOW, 8 Notes. Gates: **FAIL** G2, G6, G11 · **PARTIAL** G1, G3, G8, G9, G10, G15 · **PASS** G4, G5, G7, G12, G13, G14. Alle Korrekturen sind lokal innerhalb der bestehenden Architektur möglich; keine Fachentscheidung ist betroffen.

**Nächster Schritt:** Astra/Codex prüft jeden Befund unabhängig, korrigiert nur bestätigte Befunde (Tests je Befund laut Bericht) und dokumentiert widerlegte Befunde mit Begründung. Danach Kurz-Re-Review der geänderten Pfade, dann Bennis reale HA-Abnahme. Status bleibt höchstens Testing / Tests Pass.
