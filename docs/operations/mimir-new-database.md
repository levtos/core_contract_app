# Mimir: neue eigene Datenbank und Rolle — vorbereiteter Ablauf

**Stand 17.10.2026: Plan, nicht ausgeführt.** Erst Bennis Go für Teil B erlaubt
Provisionierung und Installation. Zuständiger Betriebsauftrag: neue Mimir-DB auf
dem von Benni benannten PostgreSQL-LXC. Host, LXC-ID, IPs, Netzbereiche,
Zertifikatsnamen und Zugangsdaten stehen ausschließlich im privaten Betriebsblatt.
Dieses öffentliche Runbook enthält keine interne Topologie oder Secrets.
Bezug: [ADR 0008](../adr/0008-mimir-naming-installation.md),
[Betrieb](../operations.md), Build-Spezifikation §11/§12/§19/§24.

## Vorbedingungen und Ziel

PostgreSQL-Version und bestehende TLS-/HBA-Konfiguration zunächst lesen und
protokollieren (App benötigt mindestens PostgreSQL 14). Zielnamen `mimir` und
`mimir_app` sind Vorschläge für die **neuen** Objekte; bei vorhandenem Objekt
anhalten und Herkunft klären, niemals vorhandene DB/Rolle umwidmen. Kein
Upgrade/Neustart des PostgreSQL-Servers im Rahmen der DB-Anlage.

Vorher Backup-Verfahren, freien Platz und Restore-Ziel bestätigen. Terra und
Legacy erhalten keine neuen Optionen und keine Schema-/Rechteänderungen.
Die App-Rolle braucht DDL für eigene Migrationen und DML ausschließlich im
eigenen Schema, keinen Superuser, keine Rollen-/DB-Erstellung, Replikation oder
BYPASSRLS. Kein fremder Rollenverbund. Admin-Credentials verbleiben beim
Provisionierungsschritt und werden niemals Mimir übergeben.

## Provisionierungsvorlage (erst Teil B)

Als autorisierter PostgreSQL-Administrator über geschützte lokale Verbindung,
`psql` mit Fehlerabbruch und ohne Mitschnitt von Passwörtern. Keine SQL-
Interpolation aus freiem Benutzereingang. `CREATE DATABASE` außerhalb einer Transaktion:

```sql
\set ON_ERROR_STOP on
CREATE ROLE mimir_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT;
SET password_encryption = 'scram-sha-256';
\password mimir_app
CREATE DATABASE mimir TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE mimir FROM PUBLIC;
GRANT CONNECT ON DATABASE mimir TO mimir_app;
\connect mimir
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mimir_app;
ALTER ROLE mimir_app IN DATABASE mimir SET search_path = public;
```

Die DB bleibt Eigentum des administrativen Provisionierers; die App besitzt nur
ihre selbst erstellten Tabellen/Indizes/Sequenzen. Das erfüllt den heutigen
unqualifizierten Migrationspfad über `public`, ohne `CREATE` auf der Datenbank
oder `TEMPORARY` zu vergeben. Keine Extension-/Cluster-Berechtigungen.
Unter der App-Rolle in **dieser DB** zusätzlich die eigenen zukünftigen Objekte
einschränken, bevor Migrationen laufen:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE mimir_app IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mimir_app IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mimir_app IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Minimalrechte gelten nicht allein durch diese GRANTs: PostgreSQL kann anderen
Datenbanken `CONNECT` an `PUBLIC` geben. Deshalb müssen **rollenbezogene**
HBA-Regeln Mimir auf die neue DB und die tatsächlich beobachtete Clientadresse
begrenzen. Vorhandene Regeln/andere Rollen nicht pauschal ändern. Reihenfolge
vor breiteren Regeln planen; Platzhalter erst privat auflösen:

```text
hostnossl all    mimir_app <client-cidr> reject
hostssl  mimir   mimir_app <client-cidr> scram-sha-256
host     all    mimir_app 0.0.0.0/0     reject
host     all    mimir_app ::/0          reject
```

Lokale Socket-Regeln ebenfalls auf einen möglichen Zugang der neuen Rolle zu
fremden DBs prüfen; falls erforderlich eine rollenbezogene `local all mimir_app
reject`-Regel vor allgemeinen Socket-Regeln planen. Admin-Provisionierung bleibt
unter der Admin-Rolle. Aktive Regeln vorher/nachher vergleichen; nur geprüfte
HBA-Datei neu laden, kein Server-Neustart. Fehlerprotokoll der HBA-Auswertung prüfen.

## TLS und Prüfung

Serverzertifikat muss zum privat festgelegten DB-DNS-Namen passen und über die
konfigurierte CA prüfbar sein. Bestehende Server-TLS-Konfiguration nur lesen;
fehlt sie, separate konkrete Änderung vor Ausführung festhalten. App:
`postgres_sslmode: verify-full`, CA read-only unter `/ssl`. Kein Wechsel auf
`require`/`disable` zur Behebung von Zertifikatsfehlern. Passwort per Secret-/
Optionsfeld, Prüfverbindungen über geschützte Service-/Passwortdatei, nie DSN im Log.

Als `mimir_app` nach Anlage nachweisen: richtige DB/Rolle, TLS via
`pg_stat_ssl` für die eigene PID, alle privilegierten Rollenattribute false,
keine Rollenmitgliedschaften; CREATE/INSERT/SELECT/ALTER/DROP einer Prüftabelle
in einer zurückgerollten Transaktion; Session-Settings des Writers aus
`docs/operations.md` akzeptiert. Server prüft HBA/TLS, Client zusätzlich CA und
Hostname. Negativtests: falsche CA/Hostname, Klartextverbindung, fremde DB,
fremde Clientadresse und fehlende Credentials werden abgewiesen. Keine
Teständerung an Terra-/Legacy-Datenbanken.

Mimir startet danach mit eigenem leeren `/data` und leerer DB; neue UUID in
`installation.json` und `cc_meta` muss übereinstimmen und von Terra verschieden
sein. Einmalige Initialisierungsoption danach zurücksetzen. Keine ID-Adoption.
Backup aus `/data`, Secrets und eigenem konsistenten `pg_dump` bilden; Restore
in separatem Testziel mit passenden Versionen prüfen. Der spätere letzte
Vor-Beta-Reset bekommt ein eigenes Runbook mit exakter DB-/ID-/Backup-Strategie.

## Ergebnisprotokoll für Teil B

| Schritt | Nachweis | Ergebnis am 17.10.2026 |
|---|---|---|
| Server-/TLS-/HBA-/Backup-Vorprüfung | private Zielkennung, Version, redigierter Prüfbericht | nicht ausgeführt |
| neue DB/Rolle, Rechte | Rollenflags, ACLs, Namensprüfung | nicht angelegt |
| positive/negative Verbindungen | TLS, CA/Hostname, DB-/Clientbegrenzung | nicht ausgeführt |
| App-Migration und Identität | Schema-Version, eigene UUID, Writer-Lock | nicht ausgeführt |
| Backup/Restore | private Backup-ID, Restore-Prüfung | nicht ausgeführt |
| Version/Start/Ingress/Bifröst | freigegebener Tag/Digest, redigierter Startlog, Verbindung | nicht installiert |

Fehlerbehandlung: bei Teilerfolg Zustand protokollieren und Mimir noch nicht
verbinden. Keine automatische Löschung, kein `DROP ... CASCADE`, keine fremden
Sessions beenden. Wiederholung beginnt mit exakter Objekt-/Eigentümerprüfung.

Referenzen für den Review: PostgreSQL [Rollenattribute](https://www.postgresql.org/docs/14/sql-createrole.html),
[Schema-Rechte](https://www.postgresql.org/docs/15/ddl-schemas.html),
[TLS](https://www.postgresql.org/docs/current/ssl-tcp.html),
[HBA-Reihenfolge und Verbindungstypen](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html).
