# ADR 0010 — G1: Lokale Zeit und Kalender als Vertragseingang

Datum: 17.10.2026. **Claude-Review freigegeben; Auflagen übernommen, Bau A2 freigegeben.**
Bezug: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[Matrix G1](../audits/akte-gap-2026-10.md), M30-20, M30-41;
Build-Spezifikation §8, §9.6, §10.2 und §18.

## Ziel und Modell

Die Clock kann bereits absolute Alarme und lokale DST-Auflösung; der reservierte
Source-Adapter `scheduler` wird bisher abgewiesen. Er soll ausdrücklich typisierte
Zeit-/Kalendereingänge liefern. Ein geschlossener Operator `time_reached` bewertet
„Zeitpunkt aus Eingang erreicht“. Kein `day_phase`-/Wake-Fachcode, kein HA-Kalender-
Servicekanal (G2) und kein erweitertes SM-Fristenmodell (G12) in diesem Block.

## Datenformat und Beispiele (Vorschlag)

Ein Scheduler-Binding wählt eine Projektion unter `Europe/Berlin`. Die bestehenden
Source-/Binding-IDs bleiben stabil. Projektionen sind abschließend:

| `projection` | Typ / Inhalt | nächste fachliche Änderung |
|---|---|---|
| `timestamp` | Timestamp, RFC 3339 UTC | standardmäßig `minute`, `second` nur ausdrücklich |
| `date` | Text, strikt `YYYY-MM-DD` | nächster lokaler Tagesbeginn |
| `time` (optional) | Text, strikt `HH:mm:ss` | nächste deklarierte Sekunde/Minute |
| `minute_of_day` | Number, lokale Minute 0–1439 | nächste Minute, Europe/Berlin |
| `day_of_year` | Number, Kalendertag 1–366 | nächster lokaler Tagesbeginn |
| `weekday` | Number, ISO 1–7 | nächster lokaler Tagesbeginn |
| `season` | Enum, deklarierte Klassen | nächste deklarierte Saison-Grenze |
| `anniversary` | Bool für deklarierten Monat/Tag | Beginn/Ende dieses lokalen Tages |

Keine neue allgemeine Date-/Time-Ausdruckssprache: Ausgabeformate sind Bestandteil
des Adaptervertrags. Saisonintervalle sind explizite, jährlich wiederkehrende
Monat/Tag-Grenzen (lückenlos, ohne Überlappung, Jahreswechsel zulässig), keine
eingebaute fachliche Definition von Sommer/Winter. Jahrestag 29.02. verlangt
`leap_day: skip | feb28 | mar01`. Unzulässiges Datum wird zurückgewiesen.
Diese Konfiguration ist prüfsummenrelevant.

```json
{"kind":"scheduler","calendar":{"timezone":"Europe/Berlin","projection":"weekday"}}
```

```json
{"op":"time_reached","at":{"op":"input","name":"planned_at"}}
```

`at` muss ein verwendbarer Timestamp mit Zeitzone sein. Ergebnis Bool:
`now_utc >= at` (einschließlich Gleichheit). Unbrauchbarer Eingang liefert
entsprechenden Status/Reason, niemals automatisch `false`. Evidence und Held-
Propagation folgen dem Eingang. Ein lokaler Zeitpunkt wird einmal über die
bestehende `berlin_utc`-Funktion aufgelöst; API-Zeitpunkte bleiben UTC.

## Ereignisplanung, Neustart und DST

Aktivierung/Start erzeugt einen aktuellen Clock-Snapshot. Jede Projektion plant
über `Clock.call_at_utc` nur ihren nächsten benötigten Wechsel. Keine periodische
Abfrage externer Eingänge und kein globaler Re-Evaluierungs-Poll. Die vorhandene
Clock-Warteschleife ist Infrastruktur; neue Fachregeln lesen Zeit ausschließlich
über Clock/Processor. Alarme tragen Revision/Node-Identität; ersetzte oder
deaktivierte Inputs löschen alte Alarme. Gleichzeitige Wechsel werden konsistent
im bestehenden Processor und Commit-before-publish verarbeitet.

`time_reached` plant den Eingangstermin, nicht wiederholte Vergleiche. Wird der
Termin geändert, wird neu geplant; liegt er bereits zurück, ist der aktuelle
Wert wahr. Der Operator ist ein Zustand, kein Event/Command und keine versteckte
SM. Die generische `edge`-Regel bleibt für Flanken zuständig.

Nach Restart oder Clock-Sprung wird der aktuelle Kalenderzustand einmal bewertet
und der nächste zukünftige Alarm geplant. Überfällige Werte werden als aktueller
Zustand sichtbar, keine nachgeholten Tageswechsel/Commands/Flanken und kein
Kontinuitätsbeweis über eine Ausfalllücke. Ein rückwärts gestellter Zeitwert kann
`time_reached` wieder falsch machen; daraus wird kein historisches Ereignisreplay.
Ein erneutes Erreichen nach dem Sprung folgt der normalen Zustandsbewertung.

Lokaler Kalender nutzt gepinntes `tzdata`. Nicht existente lokale Zeit → erste
gültige Zeit danach; doppelte lokale Zeit → `fold=0`. Wiederkehrende lokale
Termine werden aus dem lokalen Datum berechnet, nie durch UTC + 24 h. So gelten
23-/25-Stunden-Tage korrekt. Scheduler-Evidence stammt aus der App-Clock und
wird nicht von HA-Connectivity abhängig; alte gespeicherte Clock-Snapshots gelten
nicht als aktueller Uhrwert. Ungültige Clock-Evidence bleibt sichtbar ungültig.

## Tests und betroffene Stellen

Geplant: alle Projektionen und Typen, minute_of_day in beiden DST-Wechseln,
Minutenstandard ohne unnötige Sekundenauswertungen, Wochen-/Monats-/Jahreswechsel, Saisonwechsel,
29.02.-Strategien, DST-Lücke/Doppelstunde, FakeClock ohne Warten, ein Alarm am
Ziel statt Polling, Terminersatz/-entfernung, veraltete Revisionsalarme, held und
unknown, Vorwärts-/Rückwärtssprung, überfälliger Restart ohne Replay,
DB-Recovery/Commit-Fehler und Scheduler-Isolation von HA. Grenzen/Typfehler
werden bei Draft-Validierung und Aktivierung geprüft.

Adapter/Capabilities, Scheduler/Clock, deklarative Modelle/Compiler, Registry-
Dependency-/Fingerprint-Modell, Explain/API. Neue Sprachkonstrukte erhalten mit
G13/G19 eine explizite Versions-/Capability-Grenze; alte Definitionen ändern sich
nicht. Akte: M30-20 (Zeitbasis), M30-41 §5/§8/§9; deren Fachlogik bleibt vertagt.
