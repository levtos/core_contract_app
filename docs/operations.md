# Betrieb: Platform Alpha 1

Diese App implementiert nur `test.*`-Fixtures. Sie ersetzt keine bestehende
Integration. Für jede Installation: eigene App, eigene logische PostgreSQL-DB,
eigene DB-Rolle und eigene Tokens. Keine Verbindung zur Legacy-DB herstellen.
Die folgenden Installationsschritte sind eine Betriebsvorlage, keine Freigabe:
Pre-Install-Remediation und unabhängiger Delta-Review müssen bewertet sein;
reale Installation und Supervisor-Abnahme benötigen Bennis gesonderten Auftrag.

## Vorbereitung und Installation

1. Eine leere PostgreSQL-Datenbank und Rolle mit DDL-/DML-Rechten ausschließlich
   auf dieser DB anlegen. Zugangsdaten außerhalb des Repository verwahren.
2. Bridge-Integration aus `custom_components/core_contracts_bridge` über HACS
   oder manuell installieren und einmal in HA hinzufügen. Keine Entities oder
   Services entstehen. Keine Registry-Konfiguration gehört in die Bridge.
3. Für einen lokalen Supervisor-Test `uv run python dev/stage_app.py <neues-ziel>`
   ausführen. Das erzeugte Verzeichnis bildet ein lokales App-Repository; Benni
   kopiert es in den lokalen Supervisor-App-Bereich. Die unveröffentlichte
   Alpha-Image-Referenz des Source-Repository wird beim Staging entfernt.
4. DB-Optionen, TLS/CA unter `/ssl`, Anzeigename und MQTT-Modus konfigurieren.
   `SUPERVISOR_TOKEN` kommt ausschließlich aus der App-Umgebung.
   Externes MQTT unterstützt `mqtt_tls` und `mqtt_ca`; bei aktivem TLS werden
   Zertifikatskette und Hostname geprüft. Leere Credentials bedeuten anonyme
   Anmeldung. Supervisor-Credentials verbleiben ebenfalls ausschließlich serverseitig.
5. App starten. Root bereitet nur `/data` vor; Python läuft als UID/GID 10001.
   Liveness kann grün sein, während Readiness auf Registry/Snapshot wartet.
6. Ingress öffnen, `example-registry.json` als Draft importieren, Bindings auf
   eigene synthetische Testquellen ändern, validieren und ausdrücklich aktivieren.
   Die Fixtures sind keine produktiven Fach-Contracts.

App, API-Protokoll, Bridge-Protokoll, Client und Registry-/DB-Schema haben
getrennte Versionsnummern. Dieser Build erzeugt keinen Release oder Tag.

## Identität und Tokens

`/data/installation.json` und `cc_meta.installation_id` müssen übereinstimmen.
Beide leer erzeugt UUIDv4. Lokale ID bei leerer DB erfordert ausdrücklich
`initialize_empty_database: true`. Fehlende lokale ID bei bestehender DB
erfordert `adopt_installation_id` exakt passend. Unterschiedliche IDs werden
immer abgewiesen. Nach erfolgreicher Initialisierung die einmaligen Optionen
wieder deaktivieren/leeren.

`/data/secrets/consumer_token` und `admin_token` besitzen mindestens 256 Bit
Zufallsentropie und Modus 0600. Consumer benutzen Port 8787 intern und Bearer-
Authentifizierung. Keine Port-Freigabe nach außen einrichten. Ingress nutzt
Port 8099 und prüft die Peer-Adresse, nicht vom Browser gesetzte Header.
Tokens lassen sich in der Admin-UI rotieren; neue Werte erscheinen einmal im
Antwortfeld, nie im Browser-Speicher. Clients anschließend aktualisieren.
Rotation und Registry-Rollback verlangen eine Bestätigung. Fehlgeschlagene
Authentifizierungen sind IP-begrenzt; authentifizierte HTTP-Aufrufe teilen pro
IP und Rolle ein Budget von 120 pro Minute. Health-Abfragen sind ausgenommen,
WS-Deltas zählen nicht als einzelne HTTP-Aufrufe. Clients hinter derselben IP
mit demselben Role-Token teilen dieses Budget in Alpha 1.

## Fehler und Wiederanlauf

`/health/live` prüft Event-Loop-Heartbeat und Processor-Task; nur diese Route
steuert Watchdog/HEALTHCHECK. `/health/ready` meldet DB-/Registry-/Snapshot-Gates.
Späterer HA-Verlust erscheint als Komponente und Source-Problem. Ein DB- oder
Lock-Verlust friert die Fortschreibung ein; keine Publication oder Command-Acks.
Der letzte sichtbare Envelope bleibt unverändert, `publication_confirmed=false`.
Ingest hält pro Binding nur die letzte Observation. Recovery prüft Identität und
Lock neu, startet eine neue Epoche und protokolliert den Gap. Consumer resynchronisieren.
Readiness verlangt nach DB-Recovery einen neuen HA-Snapshot. Neue Connection-Gaps
werden nur beim Zustandswechsel geschrieben und invalidieren die abhängigen
Quellen/Contracts. Ein verlorenes Zwischenereignis darf keinen alten stable_for-
Anker erhalten; Grace wird aus alter Evidence nicht neu gestartet.

DB-, HA- und MQTT-Verbindungsfehler verwenden einen Backoff bis 30 s. Der Client
ergänzt Jitter und resynchronisiert nach Transport-/Framefehlern. HTTP-/WS-401/403
sind terminale Auth-Fehler; Credentials müssen korrigiert werden.

PostgreSQL-Verbindungen konfigurieren Keepalive 15 s / 5 s / 3 Versuche,
`tcp_user_timeout=30000`, `idle_session_timeout=60000` und
`idle_in_transaction_session_timeout=15000` (Millisekunden). Die dedizierte Rolle
muss diese Einstellungen setzen dürfen. Connect/Command sind auf 10 s begrenzt.
Ein Lock-Konflikt wird mit der Backend-PID diagnostiziert, niemals zwangsweise
entsperrt. Netzwerkpartitionen können bis zur serverseitigen Erkennung eine
Wiederverbindung verzögern. Reale Firewall-/WAN-Bedingungen separat nachweisen.

Die Runtime hält nur aktuellen Zustand und ausstehende Changesets. Identische
Idle-Ticks erzeugen keine Historie. Audit-Zeilen echter Änderungen bleiben in
PostgreSQL; Retention/Partitionierung ist gemäß Spezifikation §29 vertagt und
DB-Speicher muss beobachtet werden. API-Historie ist auf die neuesten 100 Einträge
sortiert begrenzt. SQL-Writes pro geänderter Zeile bleiben seriell; hohe WAN-Latenz
kann den Durchsatz begrenzen.

HA-Gerätezeit ist nur über ausdrücklich konfiguriertes `adapter.ha_time_attribute`
aktiv. Ein zufälliges Attribut `device_timestamp` wird nicht implizit interpretiert.
Fehlerhafte konfigurierte Zeitstempel liefern `invalid_value` der betroffenen
Observation. HA-State-last_changed belegt nicht die Kontinuität eines Attributs.

Migrationen sind nummeriert und mit SHA-256 geschützt. Veränderte Checksummen
oder eine neuere unbekannte DB-Version blockieren den Start. Kein automatischer
Contract-/Registry-Semantik-Upgrade. App-Updates aktivieren keine Revision.

## Konsistentes Backup und Restore

Ein Supervisor-Backup enthält `/data`, aber **nicht** die externe PostgreSQL-DB.

1. App kontrolliert stoppen, damit kein Writer weiterläuft. Letzte Publication-
   Sequenz und App-/Schema-Version notieren; `last_shutdown.json` enthält die Sequenz.
2. PostgreSQL mit `pg_dump --format=custom --file=<backup>` sichern. Credentials
   über geschützte PG-Service-/Passwortdatei bereitstellen, nie im Kommando/Log.
3. `/data`, Secrets, App-Version, DB-Schema-/Installations-ID und Dump gemeinsam
   gesichert ablegen. Wiederherstellung in separater Test-DB regelmäßig prüfen.
4. Restore: App stoppen; Dump in eine leere, eigene DB mit `pg_restore --exit-on-error`
   einspielen; passendes `/data` und App-Version wiederherstellen; ID prüfen.
5. App starten: neue Epoche, Gap, aktuelle Evidence. Keine Command-Wiederholung,
   keine Grace-Verlängerung, kein impliziter Kontinuitätsnachweis. Einen Warnhinweis
   `database_older_than_last_shutdown` ausdrücklich untersuchen.

Bei gleicher Installation-ID und neuerem Shutdown-Marker hebt die Runtime den
Sequenz-Floor an und schreibt einen Gap, bevor sie weiter publiziert. Während
eines laufenden Prozesses bleibt zusätzlich dessen zuletzt bekannte Sequenz
maßgeblich. Ein fremder Marker wird nicht als Sequenznachweis übernommen. Wenn
sowohl DB als auch `/data` älter sind, kann der Prozess extern bereits beobachtete,
nirgendwo mehr gespeicherte Sequenzen nicht rekonstruieren.

SIGTERM sendet `going_away`, schließt offene WebSockets und beendet Queue/DB
innerhalb eines gemeinsamen 25-s-Budgets. `last_shutdown.json` wird nach dem
Queue-Drain geschrieben. Der echte Supervisor-Signal-/Watchdog-Nachweis bleibt
separat offen; isolierte Docker-Tests sind kein Installationsnachweis.

Ein Supervisor-Restore überschreibt die DB niemals. Ein Rollback der Registry
ist eine neue Revision. Datenbank-Rollback und Registry-Rollback sind getrennt.

## Entwicklung

`uv sync --frozen`; `uv run pytest`; `uv run ruff check .`;
`uv run mypy --strict src client/core_contracts_client`.
Frontend: `npm ci`, `npm run check`, `npm test`, `npm run build` in `frontend/`.
Kein Preview-Server ist erforderlich. PostgreSQL-Tests verwenden ausschließlich
`TEST_DATABASE_DSN` zu einer dedizierten `*_test`-DB; sie erzeugen isolierte temporäre
DBs. Ohne DSN werden sie mit `skipped: environment` ausgewiesen.
`TEST_MQTT_DOCKER=1` aktiviert den isolierten Mosquitto-Test. Der HA-Kernel-Test
läuft im separaten CI-Environment mit gepinnter Home-Assistant-Version.
`uv run python dev/resource_probe.py` reproduziert die isolierte Idle-Messung.
Dev-Compose benötigt eine nicht eingecheckte Datei `dev/secrets/postgres_password`.
