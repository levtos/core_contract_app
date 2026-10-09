# First-Run-Wizard (Issue #8)

Technischer Entwicklungsstand, noch kein veröffentlichtes Image. Die bestehenden
Images `1.0.0a1` enthalten diesen Wizard nicht. Vor Veröffentlichung einen neuen
Versionsstand festlegen; vorhandene Tags nicht stillschweigend ersetzen.

## Reguläre Einrichtung

1. App installieren, mit unveränderten Standardoptionen starten, Weboberfläche
   über HA-Ingress öffnen. Ohne DB bleibt `/health/live` 200; Readiness 503.
   Kein manueller Supervisor-Optionsschritt für die DB erforderlich.
2. Der Assistent erkennt vorhandene Konfiguration und Identität. Bei einer
   bestehenden Alpha-Installation werden DB/Rolle/Identität nicht neu angelegt.
   Erreichbare, erfolgreich initialisierte Installationen öffnen die normale UI;
   „Einrichtung prüfen“ öffnet den Assistenten erneut.
3. PostgreSQL >=14 im separat bereitgestellten LXC, Host/Port und TLS auswählen.
   „Erreichbarkeit“ sendet ausschließlich einen PostgreSQL-SSLRequest; Version
   und CA/Hostname lassen sich erst nach Anmeldung prüfen. verify-full bleibt
   Standard. CA liegt auf dem bestehenden read-only SSL-Mount unter `/ssl`.
   require prüft den Server nicht; disable verschlüsselt nicht. Beide benötigen
   eine sichtbare ausdrückliche Bestätigung.
4. Für eine neue DB/Rolle das generierte Skript prüfen und privat im richtigen
   PostgreSQL-LXC speichern. Linux, Python >=3.10 und psql müssen vorhanden sein.
   Lokal als postgres mit Peer-Authentifizierung ausführen:
   `sudo -u postgres python3 /privater/pfad/setup.py`. Die App erhält keine
   Administratorzugangsdaten. Kein Passwort erscheint in Kommandoargumenten;
   SQL enthält einen SCRAM-Verifier statt Klartext. Normales Statement-/Fehler-
   Logging wird für die SQL-Sitzung abgeschaltet. Externe Terminalaufzeichnung
   oder zusätzliche Audit-Agenten müssen zuvor ausgeschlossen werden.
5. Das Skript legt eine NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/
   NOBYPASSRLS-Rolle und ihre eigene DB an. Bestehende fremde Objekte führen zum
   Abbruch ohne Änderung. Nur matching Setup-Marker plus privater Resume-Zustand
   erlauben Fortsetzung. Der Resume-Zustand liegt unter dem postgres-Home in
   `.core-contracts-setup`, 0700/0600; nach Abnahme geschützt entfernen.
   Keine globale Veränderung der CONNECT-Rechte fremder Datenbanken.
6. Den **geheimen** Importcode direkt vom privaten Terminal in das maskierte
   Wizard-Feld kopieren. Base64 ist keine Verschlüsselung. Code nicht in URLs,
   Shell-History, Diagnosen, Issues oder Git übernehmen; Zwischenablage danach
   löschen. Wiederholung des gleichen Skripts liefert dieselben Zugangsdaten.
   Alternativ vorhandene Verbindung eingeben. Leere DB ausdrücklich initialisieren;
   DB-only-Restore mit exakt bekannter Installations-ID ausdrücklich adoptieren.
7. Verbindung wird vor Migrationen lesend geprüft. Fremde Tabellen/Schemata,
   zu weitgehende Rollenrechte, PostgreSQL <14 und Identitätskonflikte werden
   abgewiesen. Bestehende nummerierte Migrationen laufen anschließend unter dem
   Writer-Lock. Der vorbereitete UUID-Wert sichert Wiederaufnahme über einen
   Abbruch zwischen DB-/Datei-Identitätswrites. Initialisierungs-/Adoptionsflags
   werden nach erfolgreichem Abschluss verbraucht.
8. Bridge prüfen und über den unten beschriebenen HACS-Weg einrichten. Danach
   normale Oberfläche öffnen. Registry und erster HA-Snapshot sind separate
   Readiness-Schritte: keinen produktiven Contract automatisch aktivieren.

## Persistenz und Konfigurationsautorität

Supervisor owns `/data/options.json`; diese Datei wird nie durch den Wizard
überschrieben. Solange kein Wizard-Stand existiert, gelten vorhandene Supervisor-
DB-Optionen. Nach bestätigter Übernahme ist ausschließlich die private
`/data/setup/connection.json` maßgeblich; Passwort serverseitig, Datei 0600,
Verzeichnis 0700. Status zeigt die Autorität und Nicht-Secret-Felder. Ab dann
haben Änderungen der Supervisor-DB-Optionen keine Wirkung. MQTT und Logging
bleiben Supervisor-Optionen. `/data/setup/provision.json` enthält die nicht
geheime Skriptanfrage, niemals das DB-Passwort.

Setup-Zustand, Secrets und installation.json gemeinsam mit der externen DB
sichern. App-Updates/Neustarts erhalten `/data`. Kein Browser-LocalStorage für
Credentials/Importcodes/CSRF-Token. Nach Prozessneustart den neuen CSRF-Token
durch Status-Refresh beziehen. Ein unterbrochener Schritt wird erneut geprüft,
nicht als abgeschlossen angezeigt.

Bei laufender Runtime speichert eine ausdrücklich bestätigte Neukonfiguration
den nächsten Startstand. Die laufende Verbindung wechselt nicht. Ein eigener
App-Neustart nach Backup-/Zielprüfung ist erforderlich; der Wizard löst ihn
nicht aus. Ein Wechsel zu fremder Installation wird auch dann abgewiesen.

## Bridge: unterstützter Weg und Release-Blocker

Die App besitzt `homeassistant_api: true`, `hassio_api: false`, keinen `/config`-
Mount, keinen Docker-Socket und läuft als UID/GID 10001. HA REST/WS bietet keinen
Installations-Endpunkt für Custom-Integration-Dateien. Kein Umgehen durch Root,
manager-Rechte, Hostzugriff oder Schreiben in Supervisor-Dateien.

Der Wizard prüft `core_contracts_bridge/info` und bei fehlendem Command HA's
`/api/config/config_entries/flow_handlers`. Aktive kompatible Bridge,
entdeckter Config-Flow und noch nicht entdeckte Integration werden unterschieden.
Nicht gescannte Dateien sind über diese API nicht sichtbar: daher ausdrücklich
„fehlt oder Neustart ausstehend“, keine erfundene Dateisystemdiagnose.

Bereitstellung über HACS: `Levtos/core_contract_app` als benutzerdefinierte
Integration hinzufügen, Bridge herunterladen, nach informiertem Wartungsfenster
HA Core neu starten, „Core Contracts Bridge“ hinzufügen (ein leerer Eintrag).
Der Wizard verlinkt den normalen HA-Config-Flow und führt keinen Neustart aus.
Neustart unterbricht auch die produktive Legacy vorübergehend. Nur die Domain
`core_contracts_bridge`; niemals `benni_core_contracts` ersetzen/entladen.

**SELF-INSTALL-01 bleibt Release-Blocker:** HACS-Downloadbarkeit des vorgesehenen
Quellstands sowie echte Installation/Neustart/Config-Flow sind noch zu belegen;
der HACS-Schritt ist nicht automatisiert. Eine App-only-Installation erfüllt das
Ziel vollständig automatisierter Bridge-Bereitstellung noch nicht. Alternative:
separat genehmigter enger Installer oder langfristig eine upstream HA-Integration;
beides benötigt eine weitere Architektur-/Berechtigungsentscheidung und wird
hier nicht stillschweigend umgesetzt. Kein routinemäßiges Dateikopieren.

Quellen: [Ingress](https://developers.home-assistant.io/docs/apps/presentation/#ingress),
[HA communication](https://developers.home-assistant.io/docs/apps/communication/),
[HA config flows](https://developers.home-assistant.io/docs/core/integration/config_flow/),
[HACS requirements](https://www.hacs.xyz/docs/publish/integration/).

## Reale Supervisor-Acceptance auf zweiter Instanz (offen)

- Vorher explizit zweite Instanz identifizieren/freigeben; vorhandene Einhornzentrale
  und Legacy nicht als Versuchsumgebung verwenden. Kein Auto-Deployment dieses PRs.
- Frisches `/data`, Standardoptionen, DB nicht erreichbar: Ingress-Wizard und live=200
  zehn Minuten mit aktiviertem Watchdog; ready=503 ohne Registry/Snapshot.
- Falsches Zertifikat/Hostname/Passwort sowie Nicht-Admin-/Cross-Site-Requests
  abweisen; keine Credential-Echos in App-/Supervisor-/PG-Logs.
- Eigene Test-DB/Rolle provisionieren, nach Rollen- und DB-Erstellung unterbrechen,
  fortsetzen; wiederholtes Skript ohne Passwortrotation/Datenverlust. Fremde
  gleichnamige Testobjekte unverändert. Nur synthetische isolierte Ressourcen.
- Import, Migrationen 1/2, Writer-Lock, stabile ID, Rechte UID/GID 10001 und
  0700/0600 prüfen. Neustart nach Import sowie zwischen Identity-Writes; gleiche ID.
- Upgrade-Kopie einer Alpha-Installation mit eigener DB und gleichem `/data`:
  kein ungefragter Wizard-Write, keine neue Rolle/DB/Identität/Registry.
- HACS-Installation/HA-Neustart einzeln bestätigen; Legacy danach geladen;
  Bridge-Protokoll 1 und Admin-WS geprüft. Keine App-Permission-Erweiterung.
- Registry-Draft ausschließlich `test.*` auf geprüfte isolierte Testquelle binden,
  validieren und separat freigeben/aktivieren. Snapshot, ready=200 und bestätigte
  Publication getrennt nachweisen. Cleanup ebenfalls ausdrücklich planen.

Automatisierte CI ist kein realer Supervisor- oder Live-Nachweis.
