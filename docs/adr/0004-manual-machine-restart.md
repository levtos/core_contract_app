# ADR 0004 — Administrativer Neustart eines Ablaufs

Status: **Entwurf; Bennis Freigabe steht aus. Nicht implementiert.**
Bezug: [Issue #17](https://github.com/Levtos/core_contract_app/issues/17),
Spezifikation §§6.7/16 und ADR 0003.

## Bestehender Vertrag

Befehle fordern bewachte Übergänge an. Ein generisches `set_state` bleibt
verboten. Der Standard ist automatische Wiederherstellung anhand der
deklarierten Neustart-Bedingung mit gültiger Evidence und verständliche
Diagnose. Fehlende Daten rechtfertigen keinen automatischen Reset.

## Vorgeschlagene eng begrenzte Ausnahme B2

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

## Freigabe und spätere Abnahme

Diese ADR erteilt keine Implementierungsfreigabe. Bennis ausdrückliche
Entscheidung ist Voraussetzung für einen separaten Auftrag. Dieser muss die
konkrete Command-Capability, Kennzeichnung im Envelope und Behandlung externer
Consumer festlegen. Tests müssen Autorisierung, Standard aus, Freigabe,
Bestätigung/Impact, OCC, neue Episode, Audit, Commit-Fehler, Idempotenz,
Restore ohne Wiederholung und die spätere Datenbestätigung beweisen.

Alpha 6 enthält keinen Neustart-Endpunkt, kein Freigabefeld und keine manuelle
Reset-Aktion. Merge, Release und Live bleiben eigene Gates.
