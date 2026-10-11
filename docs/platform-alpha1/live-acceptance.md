# Gebündelte synthetische Phase-1A-Live-Abnahme — noch nicht ausgeführt

Ausführung erst nach Delta-Review, Freigabe, Release und eigener Live-Freigabe.
Einzige Zielinstanz: Einhornzentrale. Keine Legacy-, Domain- oder Consumer-Migration.
Die [Testregistry](phase1a-test-registry.json) ist ein Entwurf, niemals automatisch aktivieren.

## Vorab reproduzierbar, ohne HA

```sh
uv run python dev/phase1a_acceptance.py
```

Das Skript validiert die Registry und beweist deterministisch mit MemoryStore/FakeClock
Mehrfeld-Ausgabe, vierstufige Kette, Held, Restart, unverlängerte Grace und Partial Evidence.
Der Test `test_versioned_acceptance_registry_and_offline_script` verhindert Abweichungen
zwischen Generator, eingechecktem JSON und ausführbarem Ablauf. Die PostgreSQL-Variante
läuft als `test_multistage_chain_postgres_restart_restore` in CI.

## Freizugebende Reihenfolge auf HA

1. **Sicherung/Identität:** App-/data-/Options-Backup und konsistentes `pg_dump -Fc`,
   Lesbarkeit prüfen, Paar außerhalb HA schützen. ID/Revision/Publication notieren.
   Vorhandene Supervisor-PG-Optionen prüfen. Kein Wizard-Import auf Bestandsinstallation.
2. **Update/Bridge:** Nur freigegebene App-Version installieren. Bridge-Dateien/HACS-Version
   und Domain `core_contracts_bridge` gegen Legacy `benni_core_contracts` vergleichen.
   Bridge-Installation, etwaiger HA-Neustart und Config-Entry sind getrennte Freigaben.
   Nie Legacy überschreiben, deaktivieren oder umkonfigurieren.
3. **Testquellen:** Ausschließlich neu freigegebene, eindeutig als TEST bezeichnete Helper
   `input_boolean.cc_alpha_test_a`, `input_boolean.cc_alpha_test_b`,
   `input_number.cc_alpha_test_number`. Existenz und Eigentum vorher prüfen: bestehende
   produktive gleichnamige Quellen sind ein Abbruchgrund. `sensor.example_1` wird nicht benutzt.
   Anfangswerte: a=off, b=on, number=42. Keine Gerätebindung/Automation an diese Helper.
4. **Admin-WS/Registry:** Bridge info/protocol 1, Snapshot/absent/changed/reported verifizieren.
   Testregistry per Ingress als Draft importieren, validieren, Diff prüfen und nur mit korrekter
   erwarteter Revision aktivieren. Bestehende aktive Registry vorher exportieren; keine
   produktiven Contracts durch den isolierten Entwurf ersetzen. Neue Revision protokollieren.
5. **Snapshot/Readiness/Publication:** HA-Snapshot abwarten; live=200, ready=200, DB/Lock korrekt.
   Nach zwei Sekunden stable.value=true; multi.value=42 und flag=true, health=healthy,
   available=true. Das optionale label ist absichtlich ungebunden/unknown und degradiert
   die Pflichtfelder nicht. Alle sieben Contracts tragen TEST/type test.*.
6. **Änderungen/Kette:** a=on → NOT/Fusion/stable=false. a=off → nach zwei Sekunden stable=true.
   Eine ausschließlich synthetische unavailable-Einspeisung benötigt eine eigene kontrollierte
   Testquellenmethode; ein vorhandener produktiver Sensor wird dafür nicht abgeschaltet.
   Innerhalb Grace: alle entscheidend abhängigen Felder held mit gleichem held_until;
   nach Ablauf unbekannte Hauptquelle und tragfähiges b → degraded/partial_evidence.
7. **Commands/Restore:** Synthetischen SM-v2-Command request_b_if mit confirm=true und
   stabiler Command-ID zweimal senden; identische Antwort/eine Wirkung. Falsche Revision
   → active_revision_conflict, confirm als String → invalid_value. App-Restart separat
   freigeben: ID/Revision unverändert, neue Epoche/Gap, keine Command-Wiederholung,
   absolute Deadline/Grace bleibt; Snapshot stellt Evidence wieder her. Deadline-Test
   rechtzeitig innerhalb der deklarierten Frist beginnen, sonst neue Testepisode planen.
8. **Rollback/Ausfall:** Registry-Rollback ist eine neue Revision. DB-/Lock-Ausfall nur
   isoliert für diese App-Verbindung und nach gesonderter Freigabe, nie PostgreSQL-LXC
   für andere Nutzer stoppen. Erwartung: ready=503/live=200, keine Publication, danach
   Recovery-Epoche/Gap. Stop-/SIGTERM-Dauer und Watchdog protokollieren.
9. **Abschluss:** Testrevision deaktivieren/zurückrollen und Helper/Bridge nur gemäß
   vereinbartem Rückbauplan behandeln. Keine automatische DB-Wiederherstellung.

## Read-only Client-Protokoll pro Schritt

Consumer-Token geschützt als `CORE_CONTRACTS_CONSUMER_TOKEN` setzen (nicht als CLI-Argument).
Explizite Ziel-URL und zuvor ermittelte Installation-ID verwenden:

```sh
uv run python dev/phase1a_acceptance.py --observe --url http://APP-HOST:8787 \
  --installation-id EXPECTED-UUID --seconds 30 --label graph-change --output evidence.json
```

Der Beobachter nutzt den öffentlichen Client, prüft Identität und exakt den synthetischen
Contract-Satz und protokolliert Snapshot/WS-Frames/Endstand. Er verändert weder Registry
noch Sources oder Commands. Das Protokoll enthält Testzustände, aber keine Tokens; geschützt
aufbewahren. Auch ein fehlerfreier Beobachter setzt `live_verified` nicht automatisch auf true:
die Sollwerte, Reihenfolge und offenen Ausfallgates werden mit dem Runbook abgeglichen.

**Abbruch:** Identitätswechsel, unerwartete produktive Quelle, Registry-Diff außerhalb TEST,
DB-/Lockfehler, Schemafehler, neue Restart-Schleife, unerklärte Publication-Lücke oder Legacy-
Beeinträchtigung. Logs und Ist-Zustand sichern, keine wiederholten Starts/Resets/Restores.
Rollback benötigt das passende getestete Image sowie konsistentes /data-/DB-Paar und eigene
Freigabe. Ein grüner Offline-/CI-Lauf ist keine Erlaubnis für die obigen Live-Schritte.
