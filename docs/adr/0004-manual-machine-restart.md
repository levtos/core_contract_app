# ADR 0004 — Administrativer Neustart eines Ablaufs

Status: **Angenommen für Alpha 7 durch Bennis ausdrücklichen Auftrag P9.**
Bezug: [Issue #19](https://github.com/Levtos/core_contract_app/issues/19),
[Produktentscheid in Issue #17](https://github.com/Levtos/core_contract_app/issues/17),
Spezifikation §§6.7/16 und ADR 0003.

## Bestehender Vertrag

Befehle fordern bewachte Übergänge an. Ein generisches `set_state` bleibt
verboten. Der Standard ist automatische Wiederherstellung anhand der
deklarierten Neustart-Bedingung mit gültiger Evidence und verständliche
Diagnose. Fehlende Daten rechtfertigen keinen automatischen Reset.

## Angenommene eng begrenzte Ausnahme B2

- Ein Ablauf erlaubt einen manuellen Neustart ausdrücklich pro Definition;
  Standard ist aus. Die Freigabe unterliegt der Versions-Unveränderlichkeit.
- Nur ein serverseitig autorisierter Administrator darf die Aktion anfordern.
  Ziel ist ausschließlich der deklarierte Startzustand. Andere Zustände oder
  frei gewählte Werte sind nicht zulässig.
- Vor Bestätigung zeigt die Oberfläche den statischen direkten und transitiven
  Impact auf nachgelagerte Verträge und mögliche Automationen. Terra kann
  externe Automationen nicht vollständig kennen; das wird sichtbar erklärt.
- Die Bestätigung sagt: „Der Startzustand wird manuell gesetzt und ist nicht
  durch Sensordaten bestätigt.“ Sie gilt nur für den geprüften Ablauf und die
  aktuelle Konfigurationsversion; Versionswechsel verlangt erneute Prüfung.
- Die Wirkung beginnt eine neue Episode. Zeitpunkt, Grund, Akteur,
  `origin=manual`, bisherige/neue Episode und Ergebnis werden im bestehenden
  Command-/Audit-Pfad in einer Transaktion persistiert, dann veröffentlicht.
- Stabile Command-ID, Ablaufzeit und Versionsprüfung gelten unverändert.
  Wiederholung derselben ID liefert das gespeicherte Ergebnis; Restore führt
  die Aktion niemals erneut aus. Fehler vor Commit bewirken keine Publication.
- Der Envelope und WebSocket tragen eine erkennbare Kennzeichnung
  `manual_restart`, bis der erste durch gültige Daten ausgelöste Übergang oder
  die erfüllte deklarierte Neustart-Bedingung den Zustand bestätigt. Diagnose
  und Historie unterscheiden einen manuellen Start von einem Sensornachweis.

## Konkrete Schnittstelle und spätere Abnahme

`machine.allow_manual_restart` ist standardmäßig `false`. Das ausgelassene oder
ausgeschaltete Feld ändert historische Fingerprints nicht. Eine eingeschaltete
Freigabe ist eine semantische Änderung und benötigt eine neue Vorlagenversion.

`GET /api/v1/manual-restarts/preview/{contract_id}` ist nur für Administratoren
zugänglich und liefert Startzustand, direkte/transitive Auswirkungen, aktuelle
Version und einen Zustandsprüfwert. `POST /api/v1/manual-restarts` ist ein eigener,
ebenfalls nur administrativer Command-Pfad. Er akzeptiert keine frei wählbaren
Zielzustände, keine Sensorwerte und keine vom Client behauptete Identität.
Bestätigung, Begründung, Ablaufzeit, aktuelle Version und Zustandsprüfwert sind
Pflicht. Ein Zustandswechsel seit der Vorschau erfordert eine neue Bestätigung.
Die stabile Command-ID teilt denselben Idempotenzraum wie normale Befehle.

`state_machine.manual_restart=true` und der Feldgrund `manual_restart` kennzeichnen
den manuell behaupteten Zustand in Envelope, WebSocket und Historie. Die Qualität
ist bis zur Datenbestätigung eingeschränkt; Verbraucher dürfen den manuellen
Start deshalb nicht für einen gesunden Sensornachweis halten. Normale Befehle,
Fristablauf, konstante Bedingungen und Restore entfernen die Kennzeichnung nicht.
Ein Eingangsübergang mit gültigem, gesundem, entscheidendem Sensornachweis bestätigt
den Zustand. Eine erfüllte deklarierte Wiederherstellungsbedingung mit solchem
Nachweis beginnt alternativ eine automatische Episode im definierten Startzustand.

Die technischen Nachweise umfassen Autorisierung, Standard aus, Freigabe,
Bestätigung/Impact, OCC, neue Episode, Audit, Commit-Fehler, Idempotenz,
Restore ohne Wiederholung und spätere Datenbestätigung. Externe Automationen sind
statisch nicht vollständig bekannt und müssen vor einer Live-Aktion separat
beurteilt werden; die Oberfläche weist darauf hin.

Alpha 6 enthält keinen Neustart-Endpunkt, kein Freigabefeld und keine manuelle
Reset-Aktion. Merge, Release und Live bleiben eigene Gates.
