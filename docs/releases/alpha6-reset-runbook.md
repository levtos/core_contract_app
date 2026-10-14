# K7 — Entwurf des App-DB-Reset-Runbooks

**Nur Planung; nicht ausgeführt.** Bezug: Issue #17, Umsetzungsauftrag K7,
Spezifikation §11 und [Identität/Backup](../operations.md).
Ausführung erst nach Installation von `1.0.0a6` und Bennis ausdrücklichem Go
für dieses konkrete Runbook. Ziel: App `f18065c9_core_contracts`, ausschließlich
Datenbank `core_contracts_app`; Rolle `core_contracts_app` wird erhalten.
Legacy `benni_core_contracts` sowie alle anderen DBs/Rollen sind tabu.

## Festgelegte Identität und Grenzen

Die vorhandene Installations-ID bleibt erhalten. `/data/installation.json`,
Secrets, Einrichtungsstand und Shutdown-Marker bleiben erhalten. Kein Löschen
von `/data`, keine neue UUID, keine neue Rolle oder Passwortrotation.
Bei abweichenden DB-/Rollennamen, Eigentümer, App-Version oder Installations-ID
stoppen; keine Zielnamen automatisch ableiten und keine Legacy-Zugangsdaten verwenden.

## Vorbereitung und Backup

1. Benni bestätigt installiertes Alpha 6, diese App, DB/Rolle und Wartungsfenster.
   Den aktiven Verbindungsstand privat prüfen: bei Autorität `wizard` gilt
   `/data/setup/connection.json`, sonst Supervisor-Optionen. Keine DSN/Passwörter
   oder echten DB-Inhalte in Issues, Logs, Code oder Screenshots kopieren.
2. App kontrolliert stoppen. Ausschließlich Verbindungen zu `core_contracts_app`
   prüfen; weitere Writer oder fremde Sessions führen zum Abbruch. Keine
   globalen Verbindungsabbrüche, kein HA-Neustart und kein Integrations-Reload.
3. Exakte App-DB mit `pg_dump --format=custom --file=<privater Backup-Pfad>` sichern.
   Anmeldung über geschützte PG-Service-/Passwortdatei, nicht in Argumenten.
   `/data` samt privaten Dateien und Rechten getrennt sichern. Backup-Paar,
   App-Version, DB-OID/Eigentümer, Schema-Version und Installations-ID privat zuordnen.
4. Dump mit `pg_restore --list` prüfen, beide Backups mit Prüfsummen sichern und
   Wiederherstellbarkeit bestätigen. Vor Änderung ist zusätzliches Go erforderlich,
   falls Backup oder Zielprüfung nicht eindeutig ist. Keine automatische Fortsetzung.

## Reset nach Go

5. Über ein privates Administrator-Terminal des vorher verifizierten PostgreSQL-Hosts
   die App-DB exakt prüfen: Name `core_contracts_app`, Eigentümer `core_contracts_app`,
   keine fremden Sessions. Bestehende Encoding-/Locale- und App-DB-spezifische Rechte
   aus dem Backup festhalten. Rolle und ihre Attribute/Passwort unverändert lassen.
6. Nur `core_contracts_app` entfernen und leer mit gleichem Eigentümer, Encoding/
   Locale und ihren bisherigen Rechten wieder anlegen. Kein `DROP OWNED`, kein
   globales `REASSIGN OWNED`, kein Wildcard-Reset, kein Rollen-Löschen und kein SQL
   auf Legacy. Zielnamen sind feste Literale; nicht aus einer DB-Liste generieren.
   Sitzungen werden nicht mit einem globalen `pg_terminate_backend` erzwungen.
7. App starten. Eine leere DB bei vorhandenem `/data` wird zunächst ausdrücklich
   mit `initialize_empty_database_required` blockiert; das ist die Identitätssicherung.
   Im Einrichtungsassistenten dieselbe private App-Verbindung bestätigen und
   **„Leere Datenbank initialisieren“** bewusst freigeben. Dieser Weg gilt auch bei
   Wizard-Autorität; Änderungen ausschließlich an Supervisor-DB-Optionen würden dort
   ignoriert. Alternativ nur bei verifizierter Supervisor-Autorität das vorhandene
   `initialize_empty_database`-Flag für den Initialisierungslauf ausdrücklich setzen.
8. Migrationen laufen unter dem Writer-Lock. `identity.reconcile` übernimmt die
   vorhandene lokale UUID in die leere DB. Initialisierungsflag anschließend als
   verbraucht/aus prüfen (Wizard verbraucht es selbst; Supervisor-Flag zurücknehmen).
   Keine `adopt_installation_id` setzen und keine Identity-Datei manuell ändern.

## Nachweise und Rückfall

9. Privat prüfen: lokale und DB-Installations-ID entsprechen dem Backup, Rolle/
   Rechte unverändert, persistente Verbindung verfügbar, Migrationen gültig,
   `/health/live` 200; aktive Registry fehlt, Konfigurationsversion 0, keine Entwürfe
   und keine alten Vertrags-/Quellendaten. Neue Epoche und ein durch den erhaltenen
   Shutdown-Marker erklärter History-Gap/Sequenz-Floor sind zulässig.
10. „Bereit für den leeren Nachtest“ bedeutet hier: UI und Persistenz funktionieren.
    `/health/ready` bleibt vertraglich 503 mit `no_active_registry`, bis später eine
    Testkonfiguration bewusst übernommen wird. Keine leere Version nur für eine
    grüne Readiness aktivieren; das würde Version 0 verändern. HA/Bridge steht ohne
    HA-Quellen auf „nicht benötigt“.
11. Keine Legacy-/HA-/anderen DB-Aktion ausführen. Erhaltene DB-/Rollen-Metadaten
    der übrigen Ressourcen anhand vorhandener Administrationsnachweise vergleichen;
    keinen Legacy-Datenexport anlegen. Benni bestätigt fehlende Legacy-Auswirkung.
    Im Issue nur Version, Backup-Prüfung, ID-Gleichheit, leeren Stand, Health-Ergebnisse
    und Gate-Status berichten, keine echten Daten oder Zugangsdaten.
12. Bei Fehler App stoppen. Ausschließlich dieselbe App-DB aus dem geprüften Dump
    mit `pg_restore --exit-on-error` und passendes `/data` aus dem Backup-Paar
    wiederherstellen, Rechte/Installations-ID prüfen und App erneut starten.
    Keine Legacy-Wiederherstellung, kein automatischer Software-Downgrade.

Der Reset ist destruktiv und selbst nicht transaktional rückgängig zu machen.
Ohne verifizierte Backups oder bei einer Zielabweichung bleibt er unausgeführt.
UX-Nachtest folgt erst nach Bennis Abnahme dieses leeren App-Stands.
