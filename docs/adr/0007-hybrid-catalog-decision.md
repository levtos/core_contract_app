# ADR 0007 — G4: Hybrid-Katalog, Umsetzung Alpha 10

Datum: 17.10.2026. **Produktentscheidung Benni: Variante 3 (Hybrid), beschlossen.**
Umsetzung ausdrücklich **erst Alpha 10**. Kein neuer Speicher-/Importpfad in Alpha 8.
Bezug: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[Matrix §5/G4](../audits/akte-gap-2026-10.md), M30-27, M30-34,
M07-09/10, M30-17, M30-30, P4-38 und G14.

## Ziel und Modell

Regeln und Katalogdefinitionen bleiben unveränderlich versionierte Registry-Daten.
Einträge liegen in eigener append-only Datenhaltung; jede Bearbeitung erzeugt
eine neue Inhaltsrevision. Sichtungen (`first_seen`, `last_seen`, `seen_count`)
sind Laufzeitdaten und überschreiben keine Klassifikation. Kein Auto-Merge;
Master/Varianten bleiben auf eine Ebene begrenzt.

## Datenformat und Beispiel (Skizze für Alpha 10)

Definition: `{catalog_id, definition_version, identity_rule, classes, lifecycle}`.
Eintrag: `{catalog_id, key, content_revision, classification, master_key?}`.
Sichtung: `{catalog_id, key, first_seen, last_seen, seen_count}`.
Identität berücksichtigt `scope`, `media_type`, `signal_type`, normalisierten Schlüssel.

Ein unbekannter Titel ergibt einen **gültigen** Wert „noch nicht zugeordnet“
mit Vollständigkeitshinweis gemäß G14, keinen Alarm und kein `unknown` allein
wegen fehlender Zuordnung. Benni ordnet ihn zu; die atomar gespeicherte
Inhaltsrevision wirkt sofort und stößt die Neubewertung betroffener Ergebnisse an.
Sichtungen ändern keine fachliche Wahrheit und keine Freshness.

Einmaliger Import des Bestands aus `title_classifier`: kontrollierte Übernahme
mit Herkunfts-/Duplikatbericht und wiederholsicherer Importkennung. Kein laufender
Doppelschreiber. Der Bestand wird in Alpha 8 weder gelesen noch migriert.

## Prüfsumme, Tests und spätere Designpflicht

Definitionsrevision und benutzte Inhaltsrevision müssen im Ergebnis belegbar
sein. Vor Alpha-10-Bau ist die genaue A-06-Regel für betroffene Schlüssel,
die Atomarität sofortiger Neubewertung, Konkurrenzbearbeitung und der Importpfad
zu reviewen. Diese Detailfragen sind nicht durch die Variantenentscheidung gelöst.

Geplante Alpha-10-Tests: Sichtung verändert Klassifikation nicht, unbekannter
Titel bleibt gültig mit Hinweis, sofortige Wirkung einer Zuordnung, append-only
Historie, Konkurrenzkonflikt, Backup/Restore, Importwiederholung, keine unbetroffenen
Baseline-Resets. Betroffene Spezifikation §10.3, §12, §23, G14-Envelope/Problemliste.
Keine Implementierung oder Tests durch diese ADR.
