# ADR 0005 — G17: HA-Ausfall und Connectivity

Datum: 17.10.2026. Produktentscheidung: **Benni, beschlossen**. Technisches Design:
**Vorschlag für Claude-Review; Umsetzung erst nach Review-Freigabe**.
Grundlage: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[Matrix G17](../audits/akte-gap-2026-10.md), Akte P4-65 §7/§13, M30-45 §7,
M30-46 §7/§13 und APP-01. Basis: `main@a08a51d`.

## Ziel und Ist/Soll

Heute invalidiert `Runtime.bridge_state` beim Abbruch HA-Observations und
Kontexte; `_inputs` sperrt sie zusätzlich über die HA-Dependency. Beschlossen:
Über HA bezogene Evidence verliert Aktualität nach ihrer normalen Semantik.
Ein Transportausfall erzeugt keine sofortige `unknown`-Welle. HA ist ein
Eintrag des Connectivity-Contracts, kein globales Quality- oder Apply-Gate im Core.

## Modell und Datenformat

- Transportzustand, HA-Lifecycle und Evidence-Verwendbarkeit bleiben getrennt.
  `bridge`, `ha` und Fehlerdiagnosen bleiben in `service_state` sichtbar.
- Die App stellt einen typisierten internen Connectivity-Eingang bereit. Der
  generische Connectivity-Contract bildet pro Abhängigkeit einen Eintrag ab;
  Alpha 8 liefert HA als ersten technisch belegbaren Eintrag. Keine Sammlung
  produktiver Infrastruktur-Contracts und kein zweiter `dependency_health`-Contract.
- Vorschlag für diesen Eintrag: `dependency_id`, `state` (`ready`, `starting`,
  `unavailable`), `since_at`, `reasons`, `evidence`. `ready` braucht authentifizierte,
  kompatible Bridge, Subscription und belegten HA-Lifecycle `running`. Ein
  belegtes Startstadium ist `starting`, ein Verbindungsverlust `unavailable`.
  Nicht belegbarer Lifecycle ergibt Feldstatus `unknown`, keinen erfundenen Wert.
  Ein positiv erkannter Verbindungsverlust ist ein gültiger Connectivity-Befund.
- Der interne Eingang umgeht seine eigene HA-Dependency (kein Monitor-Zyklus).
  Die Verknüpfung der Sources mit ihrer Dependency bleibt für Herkunft/Diagnose.
  Der bisherige pauschale HA-Dependency-Veto entfällt. MQTT/andere Dependencies
  werden in diesem Block nicht pauschal umdefiniert.

```json
{"dependency_id":"ha","state":"unavailable","since_at":"2026-10-17T10:00:00Z",
 "reasons":[{"code":"dependency_unavailable","input":"ha"}]}
```

Der Ausschnitt ist der geplante Wert; Status, Quality und Evidence stehen weiter
im normalen Envelope. Neue Felder/Reason-Zuordnungen benötigen API-/Client-Tests.

## Ausfall, Wiederanlauf und Beispiele

- `periodic_ttl` und `report_heartbeat` laufen bis zum belegten Ablaufzeitpunkt;
  `liveness_source` folgt ihrer ausdrücklich gebundenen Liveness-Evidence.
  `event_stateful` wird durch Alter allein nicht ungültig. Explizit gemeldetes
  `unavailable`, `restored`, unzulässige Zeitstempel und andere harte Gates gelten weiter.
- Beispiel: letzte Messung 10:00, TTL 60 s, HA-Abbruch 10:00:10: Messung bis
  10:01 verwendbar, danach `input_stale`. Der Abbruch erneuert weder Zeit noch Grace.
- `history_gap(ha_disconnect)` einmal pro Übergang persistieren. Eine Lücke
  unterbricht unbewiesene `stable_for`-Kontinuität gemäß §9.3, ohne die vorhandene
  Observation als Geräte-`unavailable` umzuschreiben. Keine neuen Flanken,
  Episoden oder Grace. Bereits laufende Grace endet zum ursprünglichen Termin.
- Nach Reconnect: aktuellen Snapshot und echte Reports prüfen. Reconnect,
  Snapshot ohne neuere Quellzeit und Re-Publication erzeugen keine frische Evidence.
  Keine Rekonstruktion entgangener Zwischenereignisse; HA-Restart ist kein Core-Restore.
- Policies/Apply dürfen `ready` als Ausführungsbedingung konsumieren. Der Core
  führt keine Geräteaktion aus. Späterer HA-Verlust startet keinen Watchdog neu;
  DB-Ausfall-/Writer-Lock-Regeln bleiben eigene Readiness-Regeln.

## Tests und betroffene Stellen

Geplant: alle vier Freshness-Modi bei Abbruch, exakter TTL-/Heartbeat-Ablauf,
keine Grace-Verlängerung, keine sofortige Mehrfach-Invalidierung, Gap-Deduplikation,
Kontinuitätsunterbrechung, unveränderte/neue Snapshot-Zeitstempel, HA-Start/Stop,
fehlende/inkompatible Bridge, Erststart ohne Evidence, Core-Restart und DB-Recovery,
Connectivity ohne Zyklus, Commit-Fehler ohne Publication, API/WS/Client.
Kein Test in A1 ausgeführt oder hinzugefügt.

Build-Spezifikation §8, §9.3, §10.2, **§13**, §21; Runtime, HA-Adapter,
Dependency-Auswertung, Scheduler, Diagnostics und API. §13 wird mit dieser ADR
bereits im Dokument präzisiert; Implementierung und Testnachweis folgen erst A2.
