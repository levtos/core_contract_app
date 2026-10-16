# K7 — Entwurf des App-DB-Reset-Runbooks

**Nur Planung; nicht ausgeführt.** Bezug: Issue #17, Umsetzungsauftrag K7,
Spezifikation §11 und [Identität/Backup](../operations.md).
Ausführung erst nach Installation von `1.0.0a6` und Bennis ausdrücklichem Go
für dieses konkrete Runbook. Ziel: App `f18065c9_core_contracts`, ausschließlich
ihre in Schritt 1 privat verifizierte Datenbank. Anwendungsrolle und Eigentümer
werden dort ermittelt und unverändert erhalten. Dieses öffentliche Runbook nennt
keine konkreten Datenbank-, Rollen- oder Eigentümernamen. Legacy sowie alle
anderen DBs/Rollen sind tabu.

## Festgelegte Identität und Grenzen

Die vorhandene Installations-ID bleibt erhalten. `/data/installation.json`,
Secrets, Einrichtungsstand und Shutdown-Marker bleiben erhalten. Kein Löschen
von `/data`, keine neue UUID, keine neue Rolle oder Passwortrotation.
Bei Abweichungen von der privaten Zuordnung aus Schritt 1, bei unklarer
Eigentümerschaft, falscher App-Version oder Installations-ID stoppen. Keine
Zielnamen aus diesem Repository, Beispielen oder einer DB-Liste übernehmen und
keine Legacy-Zugangsdaten verwenden.

## Vorbereitung und Backup

1. Benni bestätigt installiertes Alpha 6, diese App und das Wartungsfenster.
   Den aktiven Verbindungsstand privat prüfen: bei Autorität `wizard` gilt
   `/data/setup/connection.json`, sonst Supervisor-Optionen. Datenbankname und
   Anwendungsrolle ausschließlich aus dieser wirksamen Verbindung übernehmen.
   Über genau diese Verbindung rein lesend tatsächliche Datenbank und angemeldete
   Rolle bestätigen sowie DB-OID und Eigentümer ermitteln. Keine Gleichheit von
   Rollenname und Eigentümer voraussetzen. Die in dieser DB gespeicherte
   Installations-ID muss mit `/data/installation.json` dieser App übereinstimmen;
   eine fremde Installation, Legacy-/System-/gemeinsam genutzte Datenbank oder
   unklare App-Zuordnung führt zum Abbruch. Host/Ziel, DB-Name/OID, Anwendungsrolle,
   Eigentümer und Installations-ID nur privat als zusammengehörige geprüfte
   Zuordnung festhalten und durch Benni bestätigen lassen. Keine konkreten Namen,
   DSN/Passwörter oder echten DB-Inhalte in Issues, Logs, Code oder Screenshots kopieren.
2. App kontrolliert stoppen. Ausschließlich Verbindungen zur in Schritt 1
   verifizierten App-DB prüfen; weitere Writer oder fremde Sessions führen zum Abbruch.
   Keine globalen Verbindungsabbrüche, kein HA-Neustart und kein Integrations-Reload.
3. Exakte App-DB mit `pg_dump --format=custom --file=<privater Backup-Pfad>` sichern.
   Anmeldung über geschützte PG-Service-/Passwortdatei, nicht in Argumenten.
   `/data` samt privaten Dateien und Rechten getrennt sichern. Backup-Paar,
   App-Version, DB-OID/Eigentümer, Schema-Version und Installations-ID privat zuordnen.
4. Dump mit `pg_restore --list` prüfen, beide Backups mit Prüfsummen sichern und
   Wiederherstellbarkeit bestätigen. Vor Änderung ist zusätzliches Go erforderlich,
   falls Backup oder Zielprüfung nicht eindeutig ist. Keine automatische Fortsetzung.

## Reset nach Go

5. Über ein privates Administrator-Terminal des vorher verifizierten PostgreSQL-Hosts
   die private Zuordnung aus Schritt 1 unmittelbar vor dem Reset erneut prüfen:
   Datenbankname und DB-OID, Anwendungsrolle und Eigentümer müssen unverändert
   zum freigegebenen App-Ziel gehören; DB- und lokale Installations-ID entsprechen
   weiterhin dem geprüften Backup-Paar. Keine fremden Sessions. Bei jeder
   Abweichung abbrechen. Bestehende Encoding-/Locale- und App-DB-spezifische Rechte
   aus dem Backup festhalten. Rolle und ihre Attribute/Passwort unverändert lassen.
6. Nur die so verifizierte App-DB entfernen und leer mit gleichem Eigentümer, Encoding/
   Locale und ihren bisherigen Rechten wieder anlegen. Kein `DROP OWNED`, kein
   globales `REASSIGN OWNED`, kein Wildcard-Reset, kein Rollen-Löschen und kein SQL
   auf Legacy. Die Zielbezeichner stammen ausschließlich aus der privat geprüften
   Zuordnung aus Schritt 1; SQL-Bezeichner korrekt quoten. Keine fest verdrahteten
   Namen aus öffentlicher Dokumentation oder Ziele aus einer DB-Liste verwenden.
   Nach Neuanlage die neue DB-OID privat derselben bestätigten Zuordnung zuordnen.
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
    Im Issue nur Version, Backup-Prüfung, bestätigte Ziel-/ID-Gleichheit, leeren
    Stand, Health-Ergebnisse und Gate-Status berichten, keine konkreten DB-/Rollen-/
    Eigentümernamen, echten Daten oder Zugangsdaten.
12. Bei Fehler App stoppen. Ausschließlich dieselbe App-DB aus dem geprüften Dump
    mit `pg_restore --exit-on-error` und passendes `/data` aus dem Backup-Paar
    wiederherstellen, Rechte/Installations-ID prüfen und App erneut starten.
    Keine Legacy-Wiederherstellung, kein automatischer Software-Downgrade.

Der Reset ist destruktiv und selbst nicht transaktional rückgängig zu machen.
Ohne verifizierte Backups oder bei einer Zielabweichung bleibt er unausgeführt.
UX-Nachtest folgt erst nach Bennis Abnahme dieses leeren App-Stands.
