# ADR 0006 — G19: Parameter an der Vertragsinstanz

Datum: 17.10.2026. **Benni beschließt Variante A**. Technisches Design:
**Claude-Review freigegeben; Auflagen übernommen, Umsetzung A2 freigegeben**.
Bezug: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[Matrix G19](../audits/akte-gap-2026-10.md), M30-38 §1/§4, M30-44 §9,
M30-45 Parameter-Audit, M30-03/A-06 und M30-30.

## Ziel und Modell

[ADR 0003](0003-declarative-platform.md) verlangt bisher leere deklarative
Instanzparameter. Das wird für Alpha 8 ersetzt: Die unveränderliche Vorlage
deklariert das Parameterschema; der Vertrag speichert Werte in seinem vorhandenen
`parameters`-Objekt. Schwellen, Radien, Watt, Dauern und Grace ändern sich in einem
Registry-Entwurf ohne neue Vorlagenversion. Änderungen an Schema, Regeln oder
Parameterbedeutung benötigen weiter eine neue Vorlagenversion.

## Datenformat (Vorschlag)

```json
{
  "parameter_schema": {
    "near": {"schema":{"type":"number","required":true,"physical_state":false,"unit":"m"},
             "minimum":0,"label":"Naher Abstand"},
    "far":  {"schema":{"type":"number","required":true,"physical_state":false,"unit":"m"},
             "minimum":0,"label":"Weiter Abstand"}
  },
  "parameter_relations":[{"left":"near","comparison":"lt","right":"far"}]
}
```

Vertrag: `"parameters":{"near":100,"far":800}`. Zahlen sind ausschließlich
synthetische Schema-Beispiele, keine eingebauten Fachparameter.
Ein neuer geschlossener Operand `{"op":"parameter","name":"near"}` liefert
einen typisierten Konfigurationswert. Er ist keine Sensor-Evidence und wird
mit seiner Registry-Revision im Explain-Nachweis verknüpft.

- Unterstützte Typen entsprechen den bestehenden skalaren FieldSchema-Typen;
  Number nur endlich, strikt ohne Bool-/String-Coercion, Enum nur Katalogwerte,
  Timestamp mit Zeitzone. Unbekannte Namen und freie Ausdrücke werden abgewiesen.
- `minimum`, `maximum`, Einheit und verständliche Beschriftung stehen am Schema.
  Pflichtwerte haben keinen stillen Code-Default. Optionale Werte sind nur
  zulässig, wenn kein ausgewerteter Pfad ihren fehlenden Wert benötigt.
- Relationen sind eine geschlossene Liste `lt/le/eq/ne/ge/gt` zwischen vorhandenen,
  kompatiblen Parametern; Ordnung nur bei passenden Typen/Einheiten. Zyklen in
  Berechnungen entstehen nicht: Relationen prüfen Werte, sie berechnen keine.
- Einheiten werden validiert, nicht implizit umgerechnet. Parameterreferenzen
  sind in typisierten Operanden und ausdrücklich freigegebenen Zahlen-Slots
  zulässig: Bucket-Grenzen, Temporal-Dauer/Grace und bestehende SM-`deadline_s`.
  Für Zahlen-Slots gilt ein geschlossenes `number | parameter_ref`-Format;
  positive Dauergrenzen gelten nach Auflösung weiter. G12 erweitert damit noch
  kein SM-Fristenmodell in Alpha 8.
- Das vorhandene Sprachformat v1 ohne Parameter bleibt lesbar. Neue Konstrukte
  erhalten eine explizite Sprachfähigkeits-/Versionskennzeichnung; ältere
  Apps müssen sie sichtbar ablehnen. Die konkrete Versionsnummer wird in A2
  zusammen mit dem gemeinsamen G1/G13-Schema festgelegt und dokumentiert.

## Validierung, Prüfsumme und Aktivierung

Draft speichern darf unvollständige Bearbeitung erhalten; Validierung meldet
präzise Pfade wie `/contracts/0/parameters/far`. Ein ungültiger Entwurf wird nie
aktiviert. Aktivierung prüft Schema, Relationen, Slot-Grenzen und historische
Unveränderlichkeit erneut. OCC über `draft_version` und `expected_active_revision`
bleibt verbindlich; die aktive Revision ändert sich beim Bearbeiten nicht.

Die kanonischen Parameterwerte gehören vollständig zur Semantik-Prüfsumme
(bestehendes Fingerprint-Modell §9.2). Auflösung erfolgt pro Instanz/Revision;
kein Cache darf Werte zwischen Instanzen teilen. Anzeigeänderungen ändern die
Prüfsumme nicht. Parameteränderung bedeutet **A-06: neue Vergleichsbasis** für
betroffene Verträge und abhängige Kontexte, keine künstliche Flanke und keine
neue Grace. Aktivierung bewertet vorhandene verwendbare Evidence einmal neu.
Rollback aktiviert die früheren Werte als neue Revision mit passender Prüfsumme.
Fehlgeschlagener Commit lässt aktiven Stand und Publication unverändert.

## UI und Beispiel

Am Vertrag: Abschnitt **„Einstellungen für diesen Vertrag“**, Name, Erklärung,
Einheit, Wert und Feldfehler. Aktion **„Im Entwurf ändern“**, anschließend
**„Prüfen“** und vorhandener Dialog zum Übernehmen. Erläuterung in du-Form:
„Deine Änderung gilt erst, wenn du den Entwurf übernimmst.“ Relationsfehler:
„Der nahe Abstand muss kleiner als der weite Abstand sein.“ Die Auswirkungsprüfung
zeigt neue Vergleichsbasis und betroffene Verträge; kein stiller Direktsave in
die Runtime. Alle Texte über den bestehenden i18n-Katalog, verständliche Namen
vor technischen Kennungen. Keine zusätzliche Fach-Bedienseite.

## Tests und betroffene Stellen

Geplant: unbekannt/fehlend/falscher Typ/Nan/Inf/Grenzen/Einheiten, Relationsfehler,
unvollständiger Draft, zwei Instanzen derselben Vorlage mit verschiedenen Werten,
Cache-Isolation, keine neue Typversion bei Wertänderung, OCC-Konflikt,
Prüfsummenwechsel/A-06 ohne Flanke, unveränderter Name, Restore, Rollback,
Grace/Deadline nicht verlängert, Commit-Fehler. React-Interaktionen für Bearbeiten,
Fehler, Entwurfswechsel und Aktivieren; Firefox 1568×710 in A2.

Akte oben; Build-Spezifikation §6.1/§6.3, §9.1/§9.2/§9.5, §10.3;
ADR 0003, deklarative Modelle/Compiler, Registry-Validierung/Fingerprint,
Capabilities, Workbench-API und Vertragsansicht. Tests sind hier nur geplant.
