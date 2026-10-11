# Phase 1A — Konsolidierte Fertigstellung und Opus-Gegenprüfung

Auftrag: [Issue #10](https://github.com/Levtos/core_contract_app/issues/10).
Basis: `8fe65869ef1e48663fffa4525f3d5606a70bcc68` (1.0.0a2).
Auditquelle: vollständiger Opus-Soll-Ist-Bericht vom 11.10.2026, von Benni bereitgestellt.
Dieser Bericht ersetzt für den neuen Korrekturstand die Phase-1A-Aussagen im historischen
[Pre-Install-Abschlussbericht](completion-report.md). Finale SHA/CI stehen im PR-Nachweis;
es erfolgt kein Merge, Release oder Live-Eingriff in diesem Auftrag.

## Befundmatrix (P0/P1)

| Opus-Befund | Gegenprüfung / Umsetzung | Dauerhafter Nachweis |
|---|---|---|
| Ein-Feld-Contract, weitere Felder immer config_incomplete (P0) | bestätigt: Runtime verpackte jedes Ergebnis unter value. Feldmap und test.multi; Feldschemas, Pflichtfeld-Health, available und Kataloge durchgesetzt | test_phase1a: multifield_health_optional_and_downstream, field_schemas, missing_required_schema_and_undeclared_grace |
| Generische Temporal-/SM-Orchestrierung in Fixture (P0) | bestätigt: restore_pending, Edge-Puls, Age-Sampling, Restore/Re-Init/Deadline-Dispatch nach producer.py verschoben | bisherige test_restore/test_remediation unverändert plus Producer-Lifecycle-/Graph-Tests |
| Lifecycle nur Protocol (P1) | bestätigt: staged init/dispose, Disable/Revision/Restart/Stop; Exceptions verlieren keine teilweise Mutation | producer_lifecycle_transactional_disable_restore, producer_failure_discards_node_and_refresh |
| Mehrstufige Ketten ungetestet (P0) | Sonde nachvollzogen; dauerhafte vierstufige Grace→NOT→Fusion→stable_for-Kette, atomare Publication, held/degraded/partial_evidence | multistage_publication_restore_and_no_grace_extension, graph_through_real_client |
| Ketten-Restart mit PostgreSQL (P0 Test) | realer unabhängiger Store-Neuaufbau, ursprüngliche Grace-Frist, Ablauf und neue Revision | test_postgres: multistage_chain_postgres_restart_restore (CI-PostgreSQL) |
| Registry-Zyklen nur Selbstreferenz (P1) | Validierung bereits korrekt, ergänzte Mehrstufen-/Disabled-/Rollback-Tests statt Algorithmus-Umbau | chain_revision_rollback_disabled_and_multistage_cycle |
| test.* hart im generischen Registrar (E2) | bestätigt; Registrierung erweiterbar, App-Katalog unverändert synthetisch. Opus-Vorschlag core.* ausdrücklich nicht übernommen | code_defined_type_registration_extensible_but_production_only_test; G13 |
| Dependency.monitor ungenutzt (P1) | bestätigt; interne HA/MQTT- und explizite Source-Monitore, Zyklus-/Bindingprüfung, transitive Fingerprints/Invalidierung | dependency_internal_and_source_monitor, unused_ha_and_source_monitor_readiness |
| map_ref liefert input_unknown (P1) | bestätigt; spezifisches unmapped_value in HA und MQTT; Cast-/Scale-Fehler bleiben invalid_value | transforms_preserve_precise_failure, generic_transforms |
| scheduler-Adapter deklariert, nicht implementiert | bestätigt; explizite Validierungsablehnung, kein neuer Quellgenerator | scheduler_and_unsupported_monitor_rejected |
| request_refresh nicht angebunden (P1) | bestätigt; deklarierte Fähigkeit, Commit-before-dispatch, HA-Worker, test.echo v2 ohne Refresh-Schleife | refresh_capability_commit_and_worker, registered_refresh_type_only_once_per_negative_episode |
| Command-args immer abgelehnt (E3), falscher Revision-Reason | bestätigt; strikte Modelle, typisierter synthetischer Command in SM-v2, ursprüngliches Idempotenz-Envelope gespeichert | typed_commands_and_idempotency plus bestehende Command-Restore-/Commitfehler-Tests |
| HA-Snapshot blockiert MQTT-only (P1/E4) | bestätigt; erreichbare HA-Quellen einschließlich Monitore maßgeblich, keine künstliche Timeout-Freigabe | readiness_registry_dependencies, unused_ha_and_source_monitor_readiness, angepasste MQTT-Recovery-Gegenprobe |
| Bridge-Diagnostics fehlen (P1) | Adapter hatte Version/Count intern bereits; in Diagnostics veröffentlicht, Overflow-/Refresh-Zähler ergänzt | diagnostics_exposes_bridge_and_overflow; bestehende Fake-HA-Verbindungstests |
| OPUS-FU-01 ungültige Supervisor-Optionen | bestätigt: Connection-Validierung konnte vor API-Bind scheitern. Diagnoseserver und schreibgesperrter Setup-Fehler, kein DB-/Identitätswechsel | test_bootstrap, test_startup_lifecycle invalid_options, invalid_supervisor_setup_blocks_writes_without_leaking, Wizard-Regression |
| MQTT ohne Zeitpfad immer stale (P1 Doku) | spezifikationskonform, kein Fehler: Empfangszeit ersetzt nie Messzeit | dokumentiert in deviations.md, vorhandene Evidence-/MQTT-Tests |

## G1–G15 und Nachweisgrenzen

„Automatisch vollständig“ bezeichnet den technischen Umfang der angegebenen Tests,
nicht eine Freigabe der produktiven HA-Installation. CI-abhängige Aussagen gelten erst
mit dem verlinkten vollständig grünen finalen PR-Head.

| Gate | Technischer Nachweis | Echte HA-Abnahme |
|---|---|---|
| G1 Installation | Image-Matrix amd64/aarch64, Metadaten, non-root und amd64-Container-Smoke | neue Version auf Supervisor, UID und Backup-Paar erneut belegen; offen |
| G2 Bridge | Fake-HA plus echter HA-2026.10-Kernel isoliert | Admin-Rechte, reale Reports/Last/Reload/Restart offen |
| G3 Registry/UI | Aktivierung/OCC/Import/Rollback/Zyklen/Disabled automatisch; Frontend-Tests/Build | Ingress-Draft→Validierung→Aktivierung→Rollback offen |
| G4 Isolation | automatisch vollständig: ID-Matrix, Mismatch/Adoption/Initialisierung | Identität bei künftigem Update vergleichen |
| G5 Persistenz | automatisch vollständig, isolierte PostgreSQL-Ketten und Restart | aktive Testregistry nach realem App-Restart prüfen |
| G6 Restore | automatisch vollständig: generische Kit-Orchestrierung, SM/Episode/Deadline, Grace/Edge/Latch/Ketten | realer App-Restart mit HA-Snapshot offen |
| G7 Publication | automatisch vollständig: mehrere Felder und vierstufiger Graph bis echter HTTP/WS-Client | gebündelte synthetische HA-End-to-End-Abnahme offen |
| G8 Client | automatisch vollständig: Snapshot, Delta/Resync, Idempotenz und Versionskonflikt | realer Consumer-Port/Token/Zugriff offen |
| G9 DB-Ausfall | automatisch vollständig in Memory/PG/Container: Commitfehler/Freeze/Writer-Lock/Recovery | kontrollierte App-spezifische Verbindungssperre offen; separate Freigabe |
| G10 Health | automatisch: HA-/MQTT-Readiness; isolierter Bootstrap/Container/DB-Ausfall/SIGTERM | bisheriger a2-Stabilitätstest ersetzt keine neue Ausfallabnahme; offen |
| G11 Quality/Evidence | automatisch vollständig: Feldschemas/Health/available/Held, Neuheit, Messzeitquellen, Transforms, Dependency-Gründe | keine generische Code-Lücke auf Live vertagt |
| G12 No-Shadow/Profile | automatisch vollständig, bestehende Wächter und Registrytests | keine neuen Live-Aktionen |
| G13 Kein Domain-Code | automatisch vollständig: App lädt ausschließlich fixture:true/test.*; Erweiterung nur separat im Test registriert | keine Domain-Freigabe |
| G14 Qualität | vollständige CI am finalen PR-Head erforderlich: Ruff/strict mypy/alle Tests/Frontend/Wheels/beide Images/Smokes/Audits | keine Gleichsetzung mit Live |
| G15 Dokumentation | ADR E1–E4, Spezifikationsdelta, diese Befundmatrix, Abweichungen und Abnahmepaket | Opus-Delta-Review und Live-Protokoll stehen aus |

Die bereits im vorherigen Auftrag erfolgte a2-Installation, Backup-Erstellung und
zehnminütige Liveness-/Ingress-Prüfung sind historische Teilnachweise. Sie werden hier
weder erneut ausgeführt noch als Nachweis für diesen neuen Code ausgegeben.

## Verbleibende Grenzen

Keine Domain-Typen, keine Aktorik, keine externe Plugin-Plattform. Die gebündelte
[Live-Abnahme](live-acceptance.md) bleibt offen; eine grüne CI schließt sie nicht.
Arm64 wird gebaut und inhaltlich geprüft, der Lifecycle-Smoke läuft auf amd64.
Mehrere SM-Deadlines, Session-Endregeln, Delta-Minimierung, DB-Probe-Frequenz und
OPUS-FU-02/03 bleiben dokumentierte P2-Folgepunkte. SELF-INSTALL-01 bleibt wegen
HACS-Bridge-Bereitstellung für vollständige Neuinstallationen offen.
