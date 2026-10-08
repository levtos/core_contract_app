# Platform Alpha 1 – unabhängige Pre-Install-Gegenprüfung

Auftrag: ausschließlich [Issue #1](https://github.com/Levtos/core_contract_app/issues/1) und
[PR #2](https://github.com/Levtos/core_contract_app/pull/2), Branch `agent/platform-alpha1`.
Ausgangspunkt: `db85981d2c282b9d597a806fc07022e08f97c802`.
Die [Build-Spezifikation](build-specification.md) bleibt autoritativ. Der vollständige
[Opus-Bericht](opus-pre-install-review.md) ist als Quellenkopie enthalten; die ursprünglichen
GitHub-Kommentare wurden nicht verändert.

Die Klassifikation beschreibt den **Ausgangsstand**, nicht einen nach dem Fix noch offenen Fehler.
CONFIRMED bedeutet unabhängig nachvollzogen, PARTIALLY CONFIRMED grenzt die bestätigte Aussage
gegen eine zu weit gehende Teilbehauptung ab. Ein vorhandener grüner Test war kein Gegenbeweis.
Keiner der 32 Befunde musste vollständig verworfen oder mangels realer HA-Installation ungeprüft
gelassen werden. Reale Supervisor-Nachweise sind separat offen und werden nicht als bestandene
Gates ausgegeben.

## Änderungen und Testreferenzen

- **C1**: [`08cd3c8`](https://github.com/Levtos/core_contract_app/commit/08cd3c8dafdc3c48590a62e35e12ceb1ce3ab107) – begrenzter aktueller Runtime-Zustand, Evidence-/Restore-Korrekturen, Bridge, Transport, Startup/Shutdown, Client, UI und erste Regressionen.
- **C2**: [`f3309fe`](https://github.com/Levtos/core_contract_app/commit/f3309fe42bcb77a6746cb4fc36c8b40684b362d5) – zusätzliche echte Transport-/Startup-/Client-Tests, Sequenz-Floor bei DB-Rollback, Ressourcenprobe.
- **C3**: [`f77bcd4`](https://github.com/Levtos/core_contract_app/commit/f77bcd4cadca599dc30c2505206ec0711e69b093) – Fälligkeitsfilter, Kontinuitätsbeweis und Edge-Baseline, konkurrierender Overflow, Logs, sichere Validierungsdetails und ergänzende Regressionen.
- Der Abschlusscommit ergänzt Tests für Overflow während des Commits und neuere beziehungsweise fremde Shutdown-Marker sowie diese Dokumentation. Der unveränderte Originalbericht ist ausschließlich vom Formatter ausgenommen, damit dessen Codeblöcke als Quellenkopie erhalten bleiben.

Dateiangaben in der Matrix sind repository-relativ. Testnamen ohne Pfad stehen in
[`tests/test_remediation.py`](../../tests/test_remediation.py). Zusätzlich:
[`test_restore.py`](../../tests/test_restore.py), [`test_postgres.py`](../../tests/test_postgres.py),
[`test_startup_lifecycle.py`](../../tests/test_startup_lifecycle.py),
[`test_bridge_kernel.py`](../../tests/test_bridge_kernel.py),
[`test_mqtt_integration.py`](../../tests/test_mqtt_integration.py) und
[`dev/container_smoke.py`](../../dev/container_smoke.py).

## Befundmatrix OPUS-A1-001 bis OPUS-A1-032

| ID / ursprüngliche Severity | Gegenprüfung, Ergebnis und tatsächliche Ursache | Korrektur / Commit und Datei | Zugehöriger Nachweis | Verbleibendes Risiko |
|---|---|---|---|---|
| OPUS-A1-001 · BLOCKER | **CONFIRMED.** Eigene R1-Reproduktion: 1.200 Idle-Ticks erzeugen 6.005 History-Zeilen; der letzte Tick dauert 255,86 ms. Jede Auswertung publiziert; Clone/Load umfassen sämtliche Historie. | C1/C3: `runtime.py`, `persistence.py`, `schema.py`, Fixture-Callbacks, `002_history_queries.sql`. Nur fällige Timer lösen Auswertung aus. Inhaltlich gleiche Envelopes behalten Publication und Reason-Beginn. Idle-Ticks committen auch ohne Registry nichts. Historie bleibt in PostgreSQL; im Prozess liegen aktuelle Tabellen und der begrenzte Changeset. | `test_idle_soak_has_constant_current_state_history_and_publications` (10.000 gemessene Ticks), `test_idle_without_registry_does_not_commit`, `test_tick_publishes_real_freshness_and_due_temporal_changes`, PG-History-Test; `dev/resource_probe.py`. | Keine Tick-bedingte RAM-/DB-History-Flut. Tatsächliche Änderungen erzeugen weiterhin Audit-Historie; betriebliche Aufbewahrung/Partitionierung bleibt gemäß Spezifikation §29 separat. Kein tagelanger realer HA-Lasttest. |
| OPUS-A1-002 · BLOCKER | **CONFIRMED.** Der echte HA-Core definiert `last_reported`, nicht `new_last_reported`. Der ursprüngliche Fake-HA-Pfad rief den Bridge-Callback nicht auf. | C1: `custom_components/core_contracts_bridge/__init__.py` liest das tatsächliche Feld. | `test_real_state_reported_callback_and_unsubscribe`: Home Assistant 2026.10.0, tatsächlicher State-Engine und Event-Helper, eigener dekorierter Bridge-Callback. | Kein Supervisor-/Berechtigungs-/Lastnachweis einer installierten Bridge; der konkrete Eventformatfehler ist isoliert entscheidbar und korrigiert. |
| OPUS-A1-003 · HIGH | **CONFIRMED.** R2 bleibt nach restored/unavailable fälschlich valid. `is_new=False` wurde als vollständiger Grund zum Verwerfen auch negativer Quality-Evidence verwendet. | C1: `runtime.py` trennt positive Neuheit von negativen Availability-/Restore-/Assumed-/Invalid-Änderungen. Alte retained-Daten werden dadurch nicht positiv. | `test_negative_quality_transition_is_never_dropped` (drei Fälle), bestehender Retain-/Deduplikationstest. | Reale HA-Integrations-Reloads separat offen; keine bekannte statische Restlücke dieses Befunds. |
| OPUS-A1-004 · HIGH | **CONFIRMED.** R8: MQTT-Gaps alle zwei Sekunden verhindern HA-stable_for. Die Retry-Schleifen schreiben jeden Fehler als Gap; die Runtime invalidiert global. | C1/C3: `adapters/ha.py`, `adapters/mqtt.py`, `runtime.py`. Gap nur beim Verbindungszustandswechsel; Invalidierung im abhängigen Source-/Contract-Bereich; Backoff 1/2/4/8/16/30 s. Ungültige MQTT-Nachrichten sind negative Evidence, keine Verbindungslücke. | `test_gap_is_transition_only_and_mqtt_does_not_reset_ha_anchor`, `test_connection_exceptions_use_capped_backoff`, echter Mosquitto-Restarttest. | Eine echte neue Verbindungsunterbrechung bleibt ein eigener Gap. |
| OPUS-A1-005 · HIGH | **CONFIRMED.** R6 startet nach einer Stunde Gap neue Grace aus altem last_valid. Es fehlte eine Armierung für den unmittelbaren gültigen Vorgänger. | C1/C3: `temporal.py`, `runtime.py`. Grace-Armierung wird durch Gap/Restore entwertet. Eine bereits laufende Frist bleibt unverändert; Snapshots oder Ticks armieren keine neue Grace. | `test_grace_cannot_rearm_from_pre_gap_evidence` (Gap/Restart), `test_runtime_restart_restores_only_proven_anchor_or_remaining_grace`, `test_restore_grace_remaining_and_expired`. | Nur deklarierte Grace; unbekannte Lücken werden nicht durch eine neue Frist kaschiert. |
| OPUS-A1-006 · MEDIUM | **CONFIRMED.** R7 erhält den alten stable_for-Anker trotz verlorenem Zwischenereignis. | C1/C3: Overflow invalidiert betroffene Kontinuität, erhält aber fingerprintkompatible Edge-Baselines. Ein alter Zeitanker kommt ausschließlich mit §9.3-Nachweis zurück; bestehende Grace/Deadlines werden nicht neu gestartet. | `test_real_queuefull_lost_intermediate_invalidates_continuity`, `test_overflow_transaction_survives_control_requests`, Restore-Nachweise. | Zwischenereignisse bleiben verloren und werden als Gap offengelegt; sie werden nicht rekonstruiert. |
| OPUS-A1-007 · MEDIUM | **CONFIRMED.** Entity-last_changed belegt nicht die Änderung eines einzelnen Attributs. | C1: `evidence.py`: HA-Attribut-Bindings erhalten aus diesem Zeitstempel kein since_at. Messzeit und Kontinuitätsbeweis bleiben getrennt. | `test_attribute_has_no_entity_state_continuity_proof`. | Ohne quellseitigen Attributnachweis konservativer Neubeginn der Kontinuität ab aktueller Evidence. |
| OPUS-A1-008 · MEDIUM | **CONFIRMED.** R3: bool(lifecycle) wird nach dem ersten deaktivierten Schritt wahr. | C1: `runtime.py` übernimmt ausdrücklich lifecycle.ever_active. | `test_machine_has_declared_fresh_evidence_reinitialization[disabled]`. | Keine bekannte Restlücke. |
| OPUS-A1-009 · MEDIUM | **CONFIRMED.** R4 bleibt nach Parameteränderung dauerhaft unknown. Vorhandener, aber unbrauchbarer Kontext besaß keine spätere Initialisierungsregel. | C1/C2: `testing/contract_types/evaluate.py`. Die synthetische SM darf mit frischer gültiger Live-Evidence eine neue Episode im deklarierten Initialzustand beginnen. Restore/Snapshot allein erfindet keine Episode. Fehlender, inkompatibler, veralteter, teilweiser und korrupter Kontext sind abgedeckt. | `test_machine_has_declared_fresh_evidence_reinitialization` (sechs Fälle). | Die Regel gilt ausschließlich für test.state_machine; keine neue Domain-Regel. |
| OPUS-A1-010 · MEDIUM | **CONFIRMED.** R5: Validierung leert Latest-Puffer und Overflow-Flag ohne Commit. OCC-/No-op-Pfade haben dasselbe Problem. | C1/C3: `runtime.py`: eigene Overflow-Transaktion vor dem Kontrollauftrag; Pufferentfernung erst nach Commit. Während des Commits eingehender neuer Overflow bleibt markiert. | `test_overflow_transaction_survives_control_requests` (validate/duplicate/conflict), `test_failed_overflow_commit_keeps_buffer`, `test_new_overflow_during_commit_is_not_cleared`, echte QueueFull-Tests. | Bei DB-Ausfall bleibt nur der aktuelle Snapshot je Binding verfügbar; der Gap bleibt sichtbar. |
| OPUS-A1-011 · MEDIUM | **CONFIRMED.** Zwischen Bootstrap-Listener und vollständiger API lag eine Lücke; ein zweites Stop-Event ersetzte das erste Signalziel. | C1/C2: `app.py` bindet die API einmal vor DB-Initialisierung und verwendet ein durchgängiges Signalziel. Metadata/Restore gehören zum abbrechbaren Initialisierungsauftrag; vorübergehende DB-Fehler werden wiederholt. | `test_startup_listener_and_sigterm_across_slow_initialization` (connect/metadata/ready), Container-Smoke startet vor PostgreSQL. | Tatsächlicher Supervisor-Watchdog bleibt offen. |
| OPUS-A1-012 · MEDIUM | **CONFIRMED.** going_away allein schließt kein WS; zwei aiohttp-Cleanups lagen außerhalb des Budgets. | C1/C3: `api.py` verfolgt und schließt Sockets; `app.py` umfasst Socket-Close, Drain, Cleanup und DB-Close mit 25-s-Budget. Shutdown-Marker entsteht nach Drain. | `test_websockets_close_within_shutdown_budget`; echter Docker-SIGTERM mit offenem WS, Closure-/going_away-Marker. | Supervisor-Signalweiterleitung separat offen; keine offene Socket-bedingte 60-s-Wartezeit im isolierten Nachweis. |
| OPUS-A1-013 · MEDIUM | **PARTIALLY CONFIRMED.** HA/MQTT-Timeout, InterfaceError und Writer-Lock-Konflikt waren nicht überall gefangen. Gegenbeweis zur pauschalen DB-Timeout-Aussage: TimeoutError ist bereits OSError; ConnectionDoesNotExistError ist PostgresError. Diese Unterfälle waren im Ausgangscode gefangen. | C1/C2/C3: Adapter fangen externe Exceptions am Transport-Rand; Cancellation bleibt wirksam. DB-Retry umfasst InterfaceError und PersistenceUnavailable. API liefert 503 für externe DB-Fehler. Schema-/Identitätsfehler bleiben terminal. | Backoff-Tests, Startup-Lifecycle, PostgreSQL-Verlust/Lock-Tests, Container-Smoke. | Unerwartete Adapterfehler werden sicher geloggt und wiederholt; sie können eine manuelle Diagnose erfordern. |
| OPUS-A1-014 · MEDIUM | **CONFIRMED.** R10 wirft ValueError wegen ungeprüftem device_timestamp und beendet den gesamten HA-Verbindungspfad. | C1: `AdapterConfig.ha_time_attribute` macht Gerätezeit explizit; fehlerhafte externe Zeitstempel erzeugen nur invalid_value der betroffenen Observation. Empfangszeit wird nicht als Ersatz verwendet. | `test_malformed_external_timestamp_is_local_invalid_evidence` (vier Formate), `test_source_future_clock_and_backward_jump_are_rechecked`. | Ein nicht konfiguriertes gleichnamiges Attribut besitzt bewusst keine implizite Zeitsemantik. |
| OPUS-A1-015 · MEDIUM | **CONFIRMED.** Events wurden nach dem Handshake gelöscht; HA und MQTT teilten einen Weckkanal. | C1/C3: Clearing vor Handshake, separate MQTT-Revisionssignale, zusätzlicher Revisionsvergleich. | `test_handshake_revision_wakeup_and_report_filter`: Aktivierung während get_config; HA beendet alten Handshake, MQTT-Signal bleibt erhalten. | Kein Nachweis einer bestimmten realen Supervisor-Reconnect-Latenz. |
| OPUS-A1-016 · MEDIUM | **CONFIRMED.** Snapshot mit mehr als 256 Bindings füllt die Ereignisqueue; await auf den Processor blockiert den Leser. | C1: `ingest_snapshot` übergibt einen begrenzten Snapshot als einen Work-Eintrag. Reader wartet nicht auf DB-Commit. Readiness folgt erst nach Verarbeitung/Commit. QueueFull verwendet den sichtbaren Recovery-Pfad. | `test_large_snapshot_is_one_work_item` mit 601 Bindings; QueueFull-Tests. | Maximale WS-Nachricht/Registry-Größe bleibt begrenzt; keine Garantie für beliebig große Installationen. |
| OPUS-A1-017 · MEDIUM | **PARTIALLY CONFIRMED.** Unnötige Reports für event_stateful sind bestätigt. Der vorgeschlagene Filter nur heartbeat/liveness wäre zu eng: periodic_ttl und referenzierte Liveness-Sources benötigen ebenfalls neue Reports. | C1/C3: optionales report_entity_ids, abwärtskompatibel; Auswahl nach Freshness und Liveness-Referenzen. Relevante Evidence-Änderungen werden weiter publiziert. | `test_handshake_revision_wakeup_and_report_filter` (event_stateful/heartbeat/periodic), HA-Kernel-Filter/Unsubscribe-Test. | Gemischte Bindings derselben Entity können gemeinsam Reports benötigen. |
| OPUS-A1-018 · MEDIUM | **CONFIRMED.** Die API versteckt Diagnose, UI reduziert sie weiter auf HTTP 400. | C1/C3: `api.py`, `registry.py`, `frontend/src/api.ts`: feste semantische Codes und Pydantic-location/type, keine input_value/ctx; Parameterfehler bleiben strukturiert. | `test_safe_admin_validation_details`, vorhandener Zyklus-/Registry-Test, neuer Frontendtest für Fehlermeldungen. | Fachlicher JSON-Draft-Editor bleibt Alpha-UI; visuelle Abnahme offen. |
| OPUS-A1-019 · MEDIUM | **CONFIRMED.** Vorherige Tests deckten die reproduzierten Pfade nicht ab; insbesondere war der Deadline-Test aus falschem Grund grün. | C1–C3: gezielte Regressionen, echter HA-Kernel, PostgreSQL, echter Mosquitto, offenes WS beim SIGTERM; G2/G6/G11 und Abschlussbericht werden neu bewertet. | Die einzelnen Tests dieser Matrix; CI und Nachweisarten unten. | Ein bestandener isolierter Test ist kein Supervisor-Acceptance-Gate. |
| OPUS-A1-020 · MEDIUM | **PARTIALLY CONFIRMED.** Fehlende Server-Timeouts sind belegt; eine pauschale konkrete Zwei-Stunden-Dauer hängt von Server-/Netzkonfiguration ab und war kein Messwert. | C1/C3: `persistence.py`: Keepalive 15/5/3, tcp_user_timeout 30.000 ms, idle_session_timeout 60.000 ms, idle_in_transaction_session_timeout 15.000 ms; begrenzte Connect-/Command-/Close-Zeiten, sichere Lock-PID-Diagnose. Kein Force-Unlock. | PG-Settings-/Writer-Lock-Test; tatsächliche Docker-Netzwerkunterbrechung und Wiederverbindung im Container-Smoke. | Reale WAN-/Firewall-Topologie kann die Erkennung beeinflussen; Serverparameter benötigen passende PostgreSQL-Rechte. |
| OPUS-A1-021 · LOW | **PARTIALLY CONFIRMED.** Derselbe konkrete Adapterpfad konnte über verschiedene Physical Keys dupliziert werden. Dieselbe Entity mit verschiedenen Attributen oder dasselbe Topic mit verschiedenen Value-Pfaden ist hingegen nicht automatisch dieselbe Evidence. | C1: `registry.py` lehnt identische Adapterpfade ab; State/Attribut und MQTT-Value-Pfad werden berücksichtigt. physical_source_key bleibt für protokollübergreifende physische Identität erforderlich. | `test_duplicate_adapter_and_unrelated_catalog_fingerprint`, Registry-Duplikatprüfungen. | Die Registry kann eine absichtlich falsch deklarierte HA/MQTT-Identität ohne physische Metadaten nicht selbst erraten. |
| OPUS-A1-022 · LOW | **CONFIRMED.** first_snapshot blieb nach neuer DB-Epoche gesetzt. | C1: `runtime.py` setzt es bei Recovery zurück und fordert frischen HA-Snapshot an. | `test_recover_requires_new_snapshot`. | Ein fehlender HA-Snapshot blockiert Readiness weiterhin ausdrücklich. |
| OPUS-A1-023 · LOW | **CONFIRMED.** Warnung allein verhinderte Sequenzwiederverwendung nicht. | C1/C2/C3: `app.py` hebt ältere DB-Sequenz anhand derselben Installation-ID an und schreibt Gap. Laufende Recovery verwendet zusätzlich den bereits beobachteten Sequenz-Floor. Shutdown-Datei wird nach Queue-Drain geschrieben. | `test_live_database_rollback_does_not_reuse_sequence`, Startup-Lifecycle mit older_database/foreign_marker, ID-/Dump-/Restore-Tests, Container-Lifecycle. | Verlust sowohl des neueren /data-Markers als auch aller neueren DB-Daten kann unbekannte, extern schon gesehene Sequenzen nicht rekonstruieren; Backup-Paar bleibt erforderlich. |
| OPUS-A1-024 · LOW | **CONFIRMED.** Pflicht-Logs und Text-Extras fehlten. | C1/C3: `app.py`, `runtime.py`, `persistence.py`: Migration, Aktivierung/Rollback, committed Quality-Übergänge, abgelehnte Commands, Recovery und Lock-Halter; Text-/JSON-Format verwenden dieselbe Feld-Allowlist. | `test_sanitized_logging_retains_context`, bestehender Geheimnis-Test beim Start; Runtime-/PG-Pfade. | Keine Payloads/DSNs/Tokens im Log; Betriebsrotation bleibt Host-Aufgabe. |
| OPUS-A1-025 · LOW | **CONFIRMED.** Pro Subscription wuchs die Unload-Liste; globale Commands konnten nach Unload weiterlaufen; Übersetzungen fehlten. | C1/C3: ein Unload-Callback je Entry, aktive Subscriptions werden entfernt; Commands prüfen geladenen Zustand; translations/en.json und de.json. | HA-Kernel-Test mit 100 Subscribe/Unsubscribe-Zyklen, anschließend Unload und Command-Ablehnung. | Bridge läuft noch nicht im vollständigen HA-strict-Typprüfungsverbund. Isolierter Kerneltest belegt den ausgeführten Pfad; reale Config-Entry-/Supervisor-Abnahme bleibt offen. |
| OPUS-A1-026 · LOW | **CONFIRMED.** Token-Rotation/Rollback ohne Bestätigung, deaktivierte Instanzen nicht sichtbar, Validierungsfehler als Dienstfehler. | C1: `frontend/src/App.svelte` bestätigt beide Aktionen, zeigt konfigurierte Instanzen samt enabled und trennt Aktionsfehler vom Dienststatus. | Svelte-/TypeScript-Check, Frontendtests/-build, statische Gegenprüfung der Handler. | Kein Browser-/visueller UI-Smoke ausgeführt; dieser bleibt Teil der menschlichen Abnahme. |
| OPUS-A1-027 · LOW | **CONFIRMED.** Fehlversuche kamen vor dem Limiter; gemeinsame IP/Role hat gemeinsames Budget. | C1: `api.py` begrenzt Auth-Versuche vor Tokenprüfung. Health bleibt davon unabhängig. | `test_unauthorized_rate_limit_does_not_hide_health`, bestehende Auth-/Ingress-Tests. | Gemeinsame Role-Tokens und gleiche Quell-IP teilen weiter ein HTTP-Budget. Bewusstes Alpha-Limit: keine Consumer-Migration/Client-Identitätsarchitektur in Phase 1; dauerhafte WS-Streams verbrauchen dieses Budget nicht pro Delta. |
| OPUS-A1-028 · LOW | **CONFIRMED.** R9: initiale Deadline ohne passende Transition wurde dauerhaft als unbestimmbar behandelt. | C1/C3: `statemachine.py`, Fixture-Evaluation. Nicht zutreffende beziehungsweise nachweislich false Guards werden als abgearbeitet markiert; unbekannter Guard bleibt unprocessed. Überfällige Deadline wird auch nach frischem Snapshot geprüft. | `test_initial_deadline_without_transition_is_processed_once`; korrigierter `test_overdue_deadline_with_unusable_guard_is_unknown` in Zustand b; b→c-Restart-/Command-Test. | Keine rekonstruierte Transition bei unbekanntem Guard. |
| OPUS-A1-029 · LOW | **CONFIRMED.** Boolean-/Fusion-/Selektionszweige verloren Upstream-Reasons und damit den betroffenen Source-Bezug. | C1/C3: `resolver.py`, `fusion.py` erhalten die Ursachenketten; Operator-Reason darf sie ergänzen. | `test_operator_and_fusion_preserve_affected_source_reason`, Core-Quality-/Fusion-Tests. | Bei einem internen Operatorfehler ohne bestimmten Eingangsverursacher bleibt der Operator als Diagnosebezug zulässig. |
| OPUS-A1-030 · LOW | **CONFIRMED.** WS-401/403 wurden unendlich wiederholt, ungültiges JSON beendete den Iterator. | C1/C2: `client/core_contracts_client/__init__.py`: terminaler AuthenticationError, expliziter Verbindungsstatus, Resync nach fehlerhaften Frames; exponentieller Backoff mit Jitter. | `test_client_auth_failure_is_terminal`, `test_client_malformed_websocket_resynchronizes`, Sequenz-/Epoch-Resync und `test_lost_command_response_is_recovered_without_double_execution`. | Tokenwechsel erfordert bewusst neue Credentials; der Client ersetzt sie nicht selbst. |
| OPUS-A1-031 · LOW | **CONFIRMED.** Ungeordnetes SELECT plus Python-Slice garantierte nicht die letzten 100. | C1: `persistence.py`, `api.py`, Migration 002: DB-seitiges ORDER BY publication_seq DESC und LIMIT mit passendem Index; Lesepool wird verwendet. | `test_archive_queries_order_and_limit`, PostgreSQL-History-Test nach Load. | Die öffentliche Abfrage liefert maximal 100 neueste Zeilen; vollständiger Export/Paging ist kein Alpha-1-Feature. |
| OPUS-A1-032 · LOW | **CONFIRMED** als reproduzierbare Auswahl-Lücke: ZoneInfo über TZPATH kann Systemdaten vor dem gepinnten Paket verwenden. | C1: `clock.py` öffnet Europe/Berlin explizit über importlib.resources aus dem gesperrten tzdata-Paket und ZoneInfo.from_file. | Bestehende DST-/Fold-/Gap-Tests, frozen Wheel-/Image-Build. | Updates der Zeitzonenbasis benötigen weiterhin eine bewusste Lockfile-Änderung. |

## Notes N-01 bis N-08

| Note | Gegenprüfung / Ergebnis | Maßnahme, Commit/Datei, Test | Risiko / bewusste Abgrenzung |
|---|---|---|---|
| N-01 | **CONFIRMED:** positiv not_applicable kann keine Ersatz-Grace begründen. | C1 `temporal.py` propagiert NA und entfernt die Armierung; `test_not_applicable_never_uses_grace`. | Kein offener Funktionsfehler. |
| N-02 | **CONFIRMED:** alle Kataloge waren in jedem Source-Fingerprint. | C1 `registry.py` nimmt nur referenzierte Kataloge auf; `test_duplicate_adapter_and_unrelated_catalog_fingerprint`. | Relevante Katalogänderungen invalidieren weiterhin abhängige Semantik. |
| N-03 | **CONFIRMED** als Reichweitenhinweis, nicht als nachgewiesene Domain-Implementierung. | Laufzeit-Guard `TypeRegistry.register` und exakte Menge der fünf Fixture-Typen unabhängig geprüft; `test_no_domain_contract_types`, `test_no_domain_registration_outside_testing`. Kein blindes Wortfilter-Verbot für technische Bezeichner. | AST-/Wortsuche ist kein vollständiger semantischer Beweis. Code-/Delta-Review bleibt erforderlich; Ausbau des heuristischen Suchers ist kein Pre-Install-Pflichtfix. |
| N-04 | **CONFIRMED:** Actions waren per Tag referenziert. | C1 `.github/workflows/ci.yml`: auf über GitHub aufgelöste Commit-SHAs gepinnt, Tag als Kommentar. | Basis-/Service-Images haben weiter Versions-Tags; kein Release/Registry-Push. |
| N-05 | **CONFIRMED:** externe TLS-Option fehlte, leerer Benutzername wurde gesendet. | C1 `adapters/mqtt.py`, `app.py`, `core_contracts/config.yaml`: mqtt_tls/mqtt_ca, System-CA-Prüfung und Hostnameprüfung; leere Credentials werden None. Echter anonymer Mosquitto-Test. | Reale Broker-CA-/Supervisor-Services-Konfiguration wird bei Installation geprüft; TLS wird nicht stillschweigend deaktiviert, wenn konfiguriert. |
| N-06 | **CONFIRMED:** einzelne interne Restore-Schlüssel und das Feld value sind fixture-spezifisch. | C3 ergänzt typenregistrierte Fälligkeits-Callbacks. Kein Mehrfeld-/Domain-Framework-Umbau außerhalb dieses Auftrags. Die fünf Producer-End-to-End-Tests bleiben verbindlich. | Dokumentierter späterer Generalisierungspunkt vor Phase 2; Phase 2 wird hier nicht begonnen. |
| N-07 | **CONFIRMED:** ungenutzter Lesepool und serielle SQL-Roundtrips. | C1 verwendet den Pool für begrenzte Historie-/Revision-/Command-Abfragen; nur tatsächliche Changeset-Zeilen werden geschrieben. PG-History-/Commit-Failure-Tests. | SQL-Batching bleibt eine gemessene WAN-Optimierung für später. Hohe WAN-Latenz senkt Durchsatz, ändert aber nicht Commit-before-publish oder die begrenzten Queues. |
| N-08 | **CONFIRMED als positive Feststellung:** kein allgemeiner Ersatzwertpfad existiert; physical_state öffnet keinen Bypass. | `FieldValue.invariant`, `validate_fields`, geschlossene Registry-Modelle und bestehende Invalid-/Forbidden-Field-Tests sind der konkrete Gegenbeweis gegen einen daraus abgeleiteten Funktionsfehler. Keine zusätzliche Fallback-Semantik eingeführt. | Mehrfeldige produktive Schemas sind außerhalb dieser Phase. |

Es gibt **keinen pauschal vertagten MEDIUM-Fix**. Die verbleibenden Punkte sind benannte Alpha-Limits
oder tatsächliche Umgebungsnachweise. Insbesondere wurden Deadlines/Episoden und kompatible
Edge-Baselines nicht als Nebenwirkung einer Gap-Korrektur pauschal gelöscht.

## Reproduktion und Ressourcenvergleich

Die Ausgangsreproduktion lief vor der Codeänderung auf `db85981`, mit MemoryStore und FakeClock,
fünf Contracts aus example-registry.json und 0,5 s virtueller Zeit je Tick. Die Vergleichsmessung
nutzt denselben Pfad in [`dev/resource_probe.py`](../../dev/resource_probe.py). Es handelt sich um
eine isolierte Laufzeitmessung auf Windows/Python 3.14, **nicht um PostgreSQL- oder HA-RSS-Messwerte**.

| Messpunkt | Ausgangsstand | Korrigierter Stand |
|---|---:|---:|
| History-Zeilen nach 1.200 Ticks | 6.005 | 6 |
| Publications nach 1.200 Ticks | 1.201 | 2 |
| Tick 1 | 3,61 ms | 0,029 ms |
| Tick 300 | 59,01 ms | 0,019 ms |
| Tick 600 | 118,73 ms | 0,019 ms |
| Tick 1.200 | 255,86 ms | 0,019 ms |
| Median / p95 über 1.200 Ticks | nicht separat erhoben | 0,019 / 0,020 ms |
| Serialisierter aktueller State ab Tick 100 | nicht separat erhoben | konstant 10.847 Bytes |

Die zweite neue Publication ist die **tatsächlich abgearbeitete synthetische Deadline**. Danach
entsteht kein weiterer Idle-Eintrag. Der Soak-Test prüft nach Warm-up weitere 10.000 Ticks
(je eine virtuelle Minute), unveränderte Generation/History/Publications und weniger als 100 kB
zusätzliche von tracemalloc erfasste Belegung nach GC. Echte Evidence-/Freshness-/Quality- und
Temporal-Änderungen werden in separaten Gegenfällen weiterhin publiziert.

## Verifikation und G1–G15

Der endgültige Commit und sein vollständig abgeschlossener CI-Lauf werden im PR-Abschlusskommentar
festgehalten. Ein Dokument kann seinen eigenen Git-Hash nicht vor seiner Erstellung enthalten;
deshalb sind Code-Commits oben und der unveränderliche Abschlussnachweis getrennt referenziert.
Die finale Prüfkette muss auf genau diesem PR-Head grün sein.

| Nachweisart | Aussage |
|---|---|
| Simulation / Unit | FakeClock, MemoryStore, 10.000-Tick-Soak, QueueFull, Restore, Fingerprints, Backoff, kontrollierte Signal-Callbacks. |
| Echte lokale Protokollintegration | aiohttp HTTP/WS und CoreContractsClient einschließlich Resync, Antwortverlust, malformed Frames, Auth-Fehlern und geschlossenem WS. |
| Echter HA-Kernel | Home Assistant 2026.10.0 State-Engine, Event-Helper und tatsächlicher Bridge-Callback; kein Supervisor. |
| Echte PostgreSQL-Integration | Frische Testdatenbanken, SQL-Migrationen, Commit-Fehlerinjektion, Writer-Lock, geordnete begrenzte Historie, Dump/Restore. |
| Echter MQTT-Transport | Eigener wegwerfbarer Mosquitto-Container, Nachrichten, malformed Payload, Stop/Start, Wiederverbindung; keine produktive MQTT-Instanz. |
| Isolierter App-Container | amd64: DB fehlt beim Start, non-root/Dateirechte, DB-Ausfall/Recovery, Netzwerkpartition und Lock-Freigabe, SIGTERM mit geöffnetem WS. arm64: Image-Build. |
| Offen | Reale Supervisor-Installation, Supervisor-User/Ingress/Services-MQTT, realer Watchdog und Betriebsbackup; visueller UI-Smoke. |

| Gate | Korrigierte Bewertung und Nachweisgrenze |
|---|---|
| G1 | **PARTIAL** – beide Images bauen; isolierter non-root-Smoke. Reale Supervisor-Installation offen. |
| G2 | **PARTIAL** – Eventformat/Callback und Subscription-Lifecycle im echten HA-Kernel geprüft; Supervisor-Rechte, reale Last und installiertes Reload/Restart offen. |
| G3 | **PARTIAL** – Registry/OCC/Validierung/API/UI-Build geprüft; Ingress und visuelle Administration offen. |
| G4 | **PASS, isoliert** – ID-Matrix und Mismatch-Schutz; keine implizite Übernahme. |
| G5 | **PASS, isoliert** – PostgreSQL-Migration/Restart/Dump/Restore; historische Tabellen werden nicht in RAM geladen. |
| G6 | **PASS, isoliert** – neuer Runtime-Restart-Nachweis für Grace/Anker, Queue-Lücken, kompatible Baselines, Deadline und SM-Reinitialisierung. Früheres pauschales PASS ohne diese Fälle war zu breit. |
| G7 | **PASS, isoliert** – genau fünf test.*-Producer durch den vollständigen Changeset-Pfad. |
| G8 | **PASS, isoliert** – echter HTTP/WS-Client, Resync, Auth-/JSON-Fehler, Command-Antwortverlust, Shutdown-Verbindung. |
| G9 | **PASS, isoliert** – Commit-before-publish, exklusiver Writer, Rollback-Floor, Recovery und Partition-Nachweis. |
| G10 | **PARTIAL** – durchgängige Bootstrap-Liveness und geordneter Docker-SIGTERM; realer Supervisor-Watchdog offen. |
| G11 | **PASS, isoliert** – negative Evidence, Quellzeit, Freshness, Grace, Retain und Clock/DST; kein pauschaler realer HA-Nachweis. |
| G12 | **PASS, isoliert** – Drafts/OCC/disabled/ever_active, Reaktivierung und Rollback. |
| G13 | **PASS** – Runtime-Fixture-Guard, exakte Typmenge, Scope-Prüfung; keine Legacy-/Policy-/Domain-Änderung. |
| G14 | **CI-gebunden** – erst nach Ruff/Format/strict mypy, sämtlichen Backend-/PG-/MQTT-/HA-Jobs, Frontend, Wheels, beiden Images, Smoke und Dependency-Prüfung am finalen Head PASS. |
| G15 | **PARTIAL** – Befundmatrix und Betriebshinweise vorhanden; unabhängiger Opus-Delta-Review und menschliche Abnahme offen. |

## Vor Installation offen und Delta-Review-Auftrag

Status höchstens **Testing / Tests Pass**, keine Installations- oder Live-Freigabe. Die offenen
Umgebungsnachweise stehen in [build-time-verification.md](build-time-verification.md).
Release, Tag und produktive HA-Installation sind nicht freigegeben. Es gab keine Änderung
am Repository Levtos/core-contracts und keine Consumer-/Policy-Migration. Die spätere
ausdrückliche Freigabe vom 08.10.2026 erlaubt den Merge erst nach vollständiger Remediation,
grüner CI auf dem letzten Head und bestätigtem Ausschluss eines automatischen HA-Deployments.
Merge-SHA und Prüfbelege werden im PR-Abschlusskommentar dokumentiert; auch ein Merge
bleibt unterhalb der endgültigen Phase-1-Abnahme. Der Opus-Delta-Review bleibt vorgesehen;
neue Befunde werden gegebenenfalls über einen Folge-PR behoben.

Empfohlener unabhängiger Opus-Delta-Review: Ausgangscommit gegen finalen PR-Head vergleichen;
besonders Publication-Semantik/Fälligkeitsfilter, pending Overflow über Commit-Grenzen,
Continuity/Grace/Restore, tatsächliches HA-Eventformat, Startup/SIGTERM, Sequence-Floors und
die Trennung von Testnachweis und Supervisor-Acceptance prüfen. Die Matrix ist ein prüfbarer
Befundabschluss, keine Vorwegnahme dieses Reviews.
