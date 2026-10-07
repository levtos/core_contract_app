# Betrieb: Platform Alpha 1

Diese App implementiert nur `test.*`-Fixtures. Sie ersetzt keine bestehende
Integration. Für jede Installation: eigene App, eigene logische PostgreSQL-DB,
eigene DB-Rolle und eigene Tokens. Keine Verbindung zur Legacy-DB herstellen.

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

## Fehler und Wiederanlauf

`/health/live` prüft Event-Loop-Heartbeat und Processor-Task; nur diese Route
steuert Watchdog/HEALTHCHECK. `/health/ready` meldet DB-/Registry-/Snapshot-Gates.
Späterer HA-Verlust erscheint als Komponente und Source-Problem. Ein DB- oder
Lock-Verlust friert die Fortschreibung ein; keine Publication oder Command-Acks.
Der letzte sichtbare Envelope bleibt unverändert, `publication_confirmed=false`.
Ingest hält pro Binding nur die letzte Observation. Recovery prüft Identität und
Lock neu, startet eine neue Epoche und protokolliert den Gap. Consumer resynchronisieren.

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

Ein Supervisor-Restore überschreibt die DB niemals. Ein Rollback der Registry
ist eine neue Revision. Datenbank-Rollback und Registry-Rollback sind getrennt.

## Entwicklung

`uv sync --frozen`; `uv run pytest`; `uv run ruff check .`;
`uv run mypy --strict src client/core_contracts_client`.
Frontend: `npm ci`, `npm run check`, `npm test`, `npm run build` in `frontend/`.
Kein Preview-Server ist erforderlich. PostgreSQL-Tests verwenden ausschließlich
`TEST_DATABASE_DSN` zu einer dedizierten `*_test`-DB; sie erzeugen isolierte temporäre
DBs. Ohne DSN werden sie mit `skipped: environment` ausgewiesen.
Dev-Compose benötigt eine nicht eingecheckte Datei `dev/secrets/postgres_password`.
