# ADR 0011 — G13: Bucket mit n Klassen und Eingangsgrenzen

Datum: 17.10.2026. **Claude-Review freigegeben; Umsetzung A2 freigegeben.**
Bezug: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[Matrix G13](../audits/akte-gap-2026-10.md), M30-10/11/12, M30-45 §3,
A-06; Build-Spezifikation §6.5, §9.1/§9.2/§9.5.

## Ziel und Modell

Heute gibt es zwei Bool-Klassen mit festen `lower`/`upper`-Grenzen. Ein neuer
expliziter Bucket-Modus klassifiziert einen numerischen Eingang in n geordnete
Klassen mit n−1 Grenzen, jeweils optionaler Hysterese. Grenzen kommen aus
Literalen, typisierten Eingängen oder Instanzparametern ([G19](0006-instance-parameters.md)).
Die Klasse ist ein Schema-konformer skalarer Wert, kein erfundener Ersatzwert.

## Datenformat (Vorschlag für neuen Sprachmodus)

```json
{
  "op":"bucket","id":"level","arg":{"op":"input","name":"reading"},
  "classes":["low","middle","high"],"initial":{"class":"middle"},
  "boundaries":[
    {"at":{"op":"input","name":"low_limit"}},
    {"at":{"op":"parameter","name":"high_limit"},
     "hysteresis":{"lower":{"op":"literal","schema":{"type":"number","required":true,"physical_state":false},"value":18},
                   "upper":{"op":"literal","schema":{"type":"number","required":true,"physical_state":false},"value":22}}}
  ]
}
```

Im synthetischen Beispiel ist `high_limit = 20`; derselbe Einheitentyp ist
an allen Zahlen zu deklarieren. `initial` ist **immer Pflicht**:
`{"class":<Klassenwert>}` oder `{"unknown":true}`. Tagged-Form verhindert,
dass eine Klasse namens `unknown` mit dem Status verwechselt wird.

- Mindestens zwei eindeutige, gleich typisierte Klassen; n−1 Grenzen; n begrenzt
  durch dokumentiertes Capability-Limit (Vorschlag max. 64 Klassen plus bestehendes
  Knoten-/Kostenbudget). Ergebnis-Katalog und `initial` müssen passen.
- Alle Grenzen endlich, numerisch, gleiche Einheit wie `arg`. `at` streng
  aufsteigend. Hysterese `lower <= at <= upper`; ohne Hysterese gilt
  `lower = upper = at`. Benachbarte Bänder dürfen nicht überlappen
  (`upper[i] < lower[i+1]`). Keine freie Formel oder stillschweigende Sortierung.
- Statische Fehler blockieren Aktivierung. Laufzeitgrenzen werden bei jedem
  relevanten Eingangswechsel atomar gemeinsam geprüft. Unbrauchbare Grenze
  propagiert ihren Status/Reason; ungeordnete/überlappende Werte ergeben
  `unknown/invalid_value` mit betroffenem Eingang. Beide Fälle resetten den Latch.

## Auswertung, Beispiel und Zustandsübernahme

Ohne Hysterese sind die Intervalle links geschlossen: an einer Grenze gehört
der Wert in die höhere Klasse (`x >= at`); nach unten gilt `x < at`.
Mit Hysterese: von Klasse i nach i+1 bei `x >= upper[i]`, zurück bei
`x < lower[i]`. Große Sprünge durchlaufen die Grenzen deterministisch in einer
Auswertung bis zur stabilen Klasse. Kein zufälliges Überspringen von Bändern.

Beispiel drei Klassen, Grenzen 10 und 20, zweites Band [18,22): aus `middle`
bleibt 21 `middle`, 22 wird `high`; aus `high` bleibt 18 `high`, 17 wird `middle`.
Ein Grenzeingang ändert sich: sofortige Neubewertung desselben Messwerts mit
den neuen verwendbaren Grenzen. Die neue Observation ist Evidence für die Grenze,
kein neuer Messwert für `arg` und keine implizite Freshness-Erneuerung.

Erster Zustand ist das deklarierte `initial`, danach erfolgt normale Auswertung
der aktuellen gültigen Eingänge; ein Snapshot bestimmt nicht heimlich `initial`.
Bei `initial=unknown` wird erst bei eindeutigem Bereich außerhalb aller
Hysteresebänder eine Klasse gesetzt; im mehrdeutigen Band bleibt der Zustand
`unknown` mit dokumentiertem Initialisierungsgrund. Kein beliebiger Band-Default.
Alle ergebnisbestimmenden Grenzen und der Messwert liefern Evidence und folgen
Held-Propagation. Unbrauchbare Eingänge resetten auf `initial`; keine Grace im Bucket.

Latch bleibt flüchtig: Prozessneustart/DB-Recovery beginnt bei `initial`, keine
Persistenz in `node_state`. Über Registry-Revisionen nur bei gleicher vollständiger
Semantik-Prüfsumme. Eine Parameter-/Definitions-/Binding-Änderung erzeugt A-06-
Neubeginn; eine normale dynamische Grenzeingangsänderung ist Laufzeit-Evidence
und ändert die Definitionsprüfsumme nicht. Evaluation/Commit-Fehler dürfen keinen
Latch-Mischstand hinterlassen.

Das alte Bool-Format behält seine inklusive `<= lower`-/`>= upper`-Semantik und
Fingerprints. Es wird nicht still in die neue Intervallsemantik migriert.
Neues Format braucht explizite Sprachversion/Capabilities und ein eigenes
Output-Schema; Beispiele bleiben synthetisch, keine Außenhelligkeitsfachlogik.

## Tests und betroffene Stellen

Geplant: 2/3/n Klassen, jede exakte Grenze, Nullbreiten-Bänder, große Sprünge,
initial-Klasse/unknown/fehlend, ungültiger Messwert und einzelne Grenze, Einheiten,
NaN/Inf, dynamischer Saisonwechsel, widersprüchliche Grenzsnapshots, held-Frist,
Latch-Reset, Restart/DB-Recovery, gleiche/geänderte Prüfsumme, Rollback,
Commit-/Evaluationsfehler und unveränderte Legacy-Bool-Ergebnisse.

Resolver/Compiler/Capabilities, Typechecker, Input-Abhängigkeiten, Explain,
Scheduler nur für zeitabhängige Grenzeingänge ([G1](0010-clock-calendar-inputs.md)),
Registry-Validierung und Restore-Tests. A1 fügt keine Tests oder Runtime hinzu.
