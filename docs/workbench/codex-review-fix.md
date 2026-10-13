# Phase 1B — unabhängiger Review und Korrekturen

Auftrag vom 13.10.2026, Issue #15 / Draft-PR #16. Geprüfter Ausgangsstand:
`02f43440dc60051dfd057c449ffe7a191dd51683`. Sonnet-Provenienz bleibt erhalten;
dieser Folgeauftrag autorisiert Codex ausdrücklich für Review und Fehlerkorrekturen.
React 19, Backend- und Architekturvertrag bleiben unverändert. Kein Merge,
Tag, Release, Image-Publishing oder Deployment.

## Teil 1: Befunddisposition

Die frühere Korrekturdokumentation beschreibt den Sonnet-Durchgang, nicht den
Nachweis dieses Reviews. Neun zusätzliche React-Regressionen in
`review-regressions.test.tsx` scheitern gegen die fünf unveränderten betroffenen
Quelldateien von `02f4344` und bestehen nach der Korrektur.

| Altbefund | Status nach Korrektur | Nachweis |
|---|---|---|
| T1B-01 | VERIFIED FIXED | Fixture innerhalb von frontend; Byte-Gleichheit/Paketgrenze in test_scope_packaging; Teil-1-CI 38428854998 baut amd64/aarch64 ohne Publishing; finale CI wird zusätzlich gegen den gepushten Gesamtstand geprüft |
| T1B-02 | VERIFIED FIXED | draftSafety und lifecycle; neue React-Abläufe: späte Speicherantwort nach Draftwechsel, Änderungen während Speichern, kein doppelter Save |
| T1B-03 | VERIFIED FIXED | lifecycle und review-regressions; Server-Draftwechsel und aktive Revision während Validierung, verspätete Antwort A nach Wechsel zu B; echte Aktivierung/Conflict/Rollback in Engine-E2E |
| T1B-04 | VERIFIED FIXED | valueEditor, rules, build-example, manualFirst; typisierte verschachtelte Werte grafisch |
| T1B-05 | VERIFIED FIXED | rules und manualFirst: strukturierte Kataloge inklusive null, Speichern/Export/Reimport |
| T1B-06 | VERIFIED FIXED | schemaDynamic und review-regressions: variierte Capabilities, verkettete refs, rekursive Schemas, allOf, offene Objekte, Unionen, typgetreue Enums |
| T1B-07 | VERIFIED FIXED | admin: Token nur im Komponentenzustand, kein Query-/Mutation-Cache; request-budget: Rotation nach 429 wird nicht wiederholt |
| UX-01 | VERIFIED FIXED | valueEditor: eingeschränkten Textkatalog direkt grafisch anlegen |

## Neue Befunde, Ursache, Korrektur und Regression

| ID / Priorität | Ursache und Korrektur | Test |
|---|---|---|
| C1 / P1 | Save schrieb seine Antwort in jeden inzwischen geöffneten Arbeits-Draft. Dokumentgeneration bindet Erfolg/Fehler/Konflikt an den ursprünglichen Draft; lokale Änderungen und Undo bleiben erhalten. Gleichzeitige Saves werden gesperrt; doppelte Listeninvalidierung entfällt. | review-regressions (2), lifecycle, draftSafety |
| C2 / P1 | Draft und aktive Revision wurden nur vor der Prüfung gelesen; die Validierungsfunktion wurde nach einem await aus einem veränderlichen Ref genommen. Kandidat wird vor await festgehalten; Versions- und Revisionsprüfung nach Validierung; Tickets verwerfen verspätete Antworten. Ein OCC-Fehler sperrt Aktivierung/Rollback bis zur erneuten Prüfung. | review-regressions (3), lifecycle, echte Engine-E2E |
| C3 / P2 | Polling alle 15 Sekunden begrenzte kein gemeinsames Tab-Budget. Alle HTTP- und Setup-Aufrufe reservieren atomar über IndexedDB maximal 100 Slots pro 61 Sekunden auf diesem Origin; nur Zeitmetadaten, kein Inhalt. 429/Retry-After setzt gemeinsame Pause. Keine Operation wird vom Scheduler wiederholt; schreibende Mutation-Hooks setzen retry:false ausdrücklich. | request-budget (5): zwei React-Clients, Reload, 110 konkurrierende Requests, vier Schreibaktionen nach 429; Engine-E2E nutzt den echten Scheduler |
| C4 / P2 | Schema-Enums verglichen String-Konvertierungen; ref-Ketten, null-Typarrays und implizit offene Objekte waren unvollständig. Typgetreue Auswahl, ref-Auflösung mit Zyklenschutz, begrenztes allOf-Merge, explizite Null-Auswahl und offene Eigenschaften. | review-regressions (3), schemaDynamic |
| C5 / P2 | Explain griff ohne Prüfung auf fehlende Qualität zu und deutete fehlende Fusion-Auswahl als Strategie/leer. Fehlende Daten sind ausdrücklich nicht aufgezeichnet. | review-regressions, diagnostics |
| C6 / P2 | Deltas konnten während Resync den alten Stand ersetzen; fehlende publication_confirmed wurde als true dargestellt. Deltas benötigen synchronisierten, fortlaufenden Stand; unvollständige Snapshots lösen Resync aus; fehlende Bestätigung bleibt null. | live-ui: React-Ansicht mit unknown, Lücke, verspätetem Delta, neuem Epoch-Snapshot; live |
| C7 / P2 | Export sortierte Objekt-Member; Operatorwechsel verwarf unbekannte Member und Stateful-ID. Export/JSON-Ansicht erhalten Einfügereihenfolge; Operatorwechsel bewahrt unbekannte Zusatzdaten und eine vorhandene Stateful-ID. Transformwechsel bewahrt Zusatzdaten. | manualFirst: echter Import/GUI/Save/Export/Reimport mit unbekannten Membern und Reihenfolge; rules; roundtrip |
| C8 / P3 | Freshness-Moduswechsel zeigte Intervall 60, schrieb es aber nicht in den Draft. Bedingt erforderliches Intervall wird beim Moduswechsel gesetzt. | alle vier Freshness-Modi grafisch aufgebaut und von echter API validiert |

## Manual-first-Matrix

| Bereich | Grafischer Nachweis | Echter Backend-Nachweis |
|---|---|---|
| Dependencies, Sources, Bindings | manualFirst, build-registry; coverage: alle vier Freshness-Modi und neun Kombinationen aus ha_state/ha_attribute/mqtt und type_cast/unit_scale/map_ref | Engine-E2E: Aufbau der Beispielregistry plus alle coverage-Dokumente gültig |
| Kataloge und alle JSON-Werttypen | valueEditor, rules, manualFirst (verschachtelte Liste, Objekt, null) | Alpha-4-Validator; Beispiel-GUI und verlustfreier Engine-Export/Reimport |
| Definitionen, Versionen, Inputs, Multi-Outputs, Projektion, Refresh | build-example, manualFirst, versioning | Engine-E2E mit sechs typisierten Outputs und neuer unveränderlicher Version/Instanzmigration |
| input/ref/literal/and/or/not/compare/map/first_match/bucket/formula/fusion/not_applicable | Beispiel plus zusätzliche coverage-Fälle ausschließlich per React-Bedienelementen | Alle erzeugten Definitionen über echte registry/validate akzeptiert |
| stable_for/dwell/grace/edge/delta/age | jede Operation separat gewählt, ID und Dauer grafisch gesetzt; Delta mit zwei Zahlargumenten | alle sechs Definitionen von echter API akzeptiert |
| State Machines, Guards, Commands/Argumente, Episoden, Sessions, Deadline, Reinit | build-example/test.flow und manualFirst; stateless Guard-Sperre in rules | Engine-E2E-Beispiel plus vorhandene Alpha-4-Backend-Akzeptanztests |
| Dynamische Capability-Schemas | schemaDynamic plus neue ref-/allOf-/Union-/Enum-Fälle; keine Fixture-Beschränkung im Editor | Server bleibt alleinige Validierungsautorität; synthetische Metadaten sind kein neuer Backend-Operator |
| Registry-Lifecycle, OCC, Validierung, Diff, Aktivierung, Rollback | lifecycle, draftSafety, review-regressions, manualFirst | echter Engine-Ablauf: GUI-Aufbau → Save → Validate → Activate → WS → Export/Reimport → neue Version → Rollback → Konflikt |
| Live, Diagnose, Admin | live-ui, live, diagnostics, admin | echte WS-Snapshots/Deltas/Revisionswechsel im Engine-E2E; HA-Discovery/Ingress bleiben Live-Gates |

## Verifikation und verbleibende Gates

Die genaue Commit-SHA, Testzahlen und finale CI stehen im Abschlusskommentar von
PR #16. Lokale Prüfkette: Ruff/Lint und Format, strict mypy, pytest,
Frontend-Typecheck, React-Unit/Integration, Engine-workbench-e2e, Build,
verify:dist, git diff --check. Es gibt im übernommenen Frontend keinen separaten
ESLint-Job; dessen vorhandene statische Prüfung ist TypeScript strict.
Die CI baut/paketprüft amd64 und aarch64 sowie den amd64-Container-Lifecycle;
lokal steht Docker nicht zur Verfügung. Die aarch64-Matrix hat keinen eigenen
Lifecycle-Smoke und wird nicht als ausgeführter Smoke bezeichnet.

Offen: sichtbarer Firefox, reale HA-Ingress-/Supervisor-Einbettung und Installation,
reale Discovery-Größe/Latenz, menschliche Barrierefreiheits- und Live-Abnahme.
Die temporäre lokale Engine verwendet ausschließlich MemoryStore/synthetische
Daten, keinen HA-/Bridge-/PostgreSQL-Zugriff. Nur der eigene Testprozess wird beendet.

Das Request-Budget gilt gemeinsam auf demselben Browser-Origin, auch über Reloads.
Andere Browserprofile/Origins teilen diesen Speicher nicht; das serverseitige
120/min-Limit bleibt dort die Autorität, und 429 wird ebenfalls respektiert.
Bei fehlendem IndexedDB wird kein unbudgetierter Request verschickt.
Object-Member-Reihenfolge wird im Frontend bewahrt; ein Backend-Export kann bekannte
Defaults ergänzen. Die Engine-E2E vergleicht deshalb die normalisierte Konfiguration
mit dem echten statischen Diff. Unbekannte Member eines zukünftigen Schemas werden
im GUI bewahrt, aber nicht gegen den heute geschlossenen Backend-Vertrag aktiviert.

## Teil 2: Flexible Workbench

Teil 1 ist als `bd968df7a713bd7a61ab62291e60bf870a3e70bf` getrennt committed und
gepusht. Erst nach Erfolg aller sechs Jobs der CI 38428854998 begann Teil 2.

Die feste Hauptnavigation ist einklappbar, behält zugängliche Linknamen und markiert
auch die Definitionen als Teil der aktiven Contracts-Ansicht. Funktionale Panels
lassen sich über „Layout anpassen“ am Griff ziehen, über Pfeiltasten bzw. Buttons
verschieben und auf drei sinnvolle Breiten setzen. Reset stellt die Vorgaben der
Ansicht wieder her. Auf schmalen Bildschirmen bleiben Panels einspaltig; die Buttons
sind die Alternative für Touch und Tastatur.

Der schlanke DOM-Adapter von `@atlaskit/pragmatic-drag-and-drop` übernimmt native
Drag-Ereignisse, ohne ein Window-Management oder zusätzliche UI-Bibliothek.
Panels sind stabile React-Geschwister mit festen Schlüsseln: Layoutänderungen
verschieben weder den Editorzustand in einen Cache noch remounten sie den Editor.
Dialoge und Sicherheitsbestätigungen bleiben fest und außerhalb des Layouts bzw.
in ihren bestehenden Portalen. Kein Layoutaufruf führt eine Backend-Aktion aus.

Abgedeckt sind Übersicht, Registry/Drafts, Collections mit Editoren, Definitionen,
Instanzen/Live/Abhängigkeiten, Graph, Diagnose/Historie/Publikationen/Evidence/Commands
und Administration. Hauptnavigation, Editorzustand und fachliche Tabs bleiben stabil.
Einzelne reine Konfigurationsformulare werden nicht künstlich in weitere Panels geteilt.

LocalStorage enthält ausschließlich freigegebene Panel-IDs, Reihenfolge, Breiten und
den booleschen Menüstatus, getrennt durch Installation-ID und logische Ansicht.
Vor bekannter Installation-ID wird nichts gespeichert. Beschädigte Metadaten werden
ignoriert; fehlender Speicher verhindert nur Persistenz. Inhalte, Secrets, Tokens,
Contract-IDs und Registry-Dokumente gelangen nicht in diese Layout-Metadaten.

`PanelLayout.test.tsx` prüft sechs echte React-Abläufe: native Drag-Ereignisse mit
dem unveränderten Library-Adapter unter StrictMode, Tastatur mit erhaltenem Fokus,
Reload/Persistenz/Installationstrennung, Reset/Breite, beschädigten Speicher und
einen ungespeicherten echten Source-Editor ohne Backend-Schreibzugriff. Die feste
Navigation und ihr aktiver Zustand werden ebenfalls durch Interaktion geprüft.
Nach Integration bestehen alle 157 React-Unit-/Integrationstests und beide
Engine-E2E-Abläufe; Typecheck, Build, verify:dist und Production-Dependency-Audit
sind grün. Sichtbare Firefox-/Touch-Abnahme bleibt ein offenes Gate.
