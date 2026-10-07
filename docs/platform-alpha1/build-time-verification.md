# Build-Time Verification / menschliches Acceptance Gate

Die automatisierten Tests laufen ohne produktive Home-Assistant-Instanz. Fake-HA
beweist Protokollverhalten, nicht Supervisor-Berechtigungen oder reale HA-Last.

| Nachweis | Verfahren | Gate |
|---|---|---|
| Python 3.14 / asyncpg / aiomqtt | frozen uv, strict types, Import-/Unit-/Integrationstests | automatisiert |
| amd64/aarch64 Wheels und Image | CI-Image-Matrix, kein Push | automatisiert |
| Migration, Commit, Lock, Restore | PostgreSQL-Service in CI | automatisiert |
| Supervisor-Installation und non-root | lokales gestagtes App-Repository installieren; Prozess-UID 10001 prüfen | offen: G1 |
| Bridge Admin-WS | Supervisor-User ruft info/subscribe auf; fehlende Rechte müssen sichtbar fehlschlagen | offen: G2 |
| HA Reports / Last | gleiche Zustände melden, Reihenfolge und `last_reported` prüfen; Filter nur konfigurierte Entities | offen: G2 |
| HA Restart / Bridge Reload | Gap, Reconnect und Snapshot beobachten; keine neue Quellzeit erzeugen | offen: G2 |
| Ingress | Nur tatsächliche Supervisor-Peer-Adresse zulassen; manipulierte Weiterleitungsheader ablehnen | offen: G3 |
| Admin-UI | Draft importieren, validieren, aktivieren, neue Revision durch Rollback; TEST-Markierung | offen: G3 |
| MQTT Services-API | `mqtt:want`, Modus supervisor, Credentials nur serverseitig | offen |
| Container-SIGTERM | init:true; geordneter Stop in <30 s, kein Ack vor Commit | offen: G10 |
| DB-Ausfall | externe DB trennen: Readiness rot, Liveness grün, Quality des letzten Standes unverändert | offen: G10 |
| Recovery | DB verbinden: neuer Epochenschlüssel, history_gap, keine Ereigniswiederholung | offen: G9 Smoke |
| Backup/Restore | `/data` und separaten PG-Dump konsistent sichern/wiederherstellen; mismatch und ältere DB prüfen | offen |

Die offenen Nachweise blockieren das Acceptance Gate (§27). Ein grüner PR hebt
sie nicht auf. Nach Bennis Gate folgen unabhängiger Opus-Review, Befundprüfung
und Korrekturen; Domain-Contracts werden durch diesen Build nicht freigegeben.

Implementierungsreferenzen: [HA Events](https://developers.home-assistant.io/docs/integration_listen_events/),
[Ingress](https://developers.home-assistant.io/docs/apps/presentation/),
[App-Kommunikation](https://developers.home-assistant.io/docs/apps/communication/).
