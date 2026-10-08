# Core Contracts Platform Alpha 1

Nur generische Plattform und synthetische TEST-Fixtures. Keine produktiven
Domain-Contracts oder Consumer-Migration. Betrieb, Identität, Tokens und
Backup/Restore: [Operations](https://github.com/Levtos/core_contract_app/blob/main/docs/operations.md).

Eine eigene Datenbank auf **PostgreSQL 14 oder neuer** und die Thin HA I/O Bridge
sind erforderlich. Der Writer setzt `idle_session_timeout` (erst ab PostgreSQL 14).
Die dedizierte App-Rolle benötigt DDL-/DML-Rechte auf ihrem Schema und ihren Tabellen
für Migrationen und Runtime-Writes sowie das Recht, die Session-Settings
`tcp_keepalives_idle`, `tcp_keepalives_interval`, `tcp_keepalives_count`,
`tcp_user_timeout`, `idle_session_timeout`, `idle_in_transaction_session_timeout`
und `application_name` zu setzen. Standard-PostgreSQL verlangt hierfür keinen
Superuser; bei verwalteten Diensten die Freigabe der Settings prüfen. Abgewiesene
Settings oder PostgreSQL <14 verhindern den Verbindungsaufbau.

Der Bearer-Listener begrenzt alle nicht-Health-Anfragen mit `auth:{ip}` auf
120 pro Minute je IP über alle Rollen; zusätzlich gilt ein Budget je IP und Rolle
von 120 pro Minute. Auch erfolgreiche Anfragen zählen zum gemeinsamen IP-Budget.
Details zu Ingress, Health und WebSocket stehen in Operations.

Supervisor-/Live-Abnahme erfolgt separat durch Benni.
