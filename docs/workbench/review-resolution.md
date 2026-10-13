# Terra Phase 1B — Korrektur nach dem Codex-Review

Review: [PR #16](https://github.com/levtos/core_contract_app/pull/16#issuecomment-6122092943),
Basis `f52be4b`. Stand dieser Datei: Korrekturdurchgang, Implementierungsagent `agent:claude`.
Es wurde kein Backend verändert; kein Merge, Release, Image-Publish oder Deployment.

Alle neuen Regressionstests wurden zusätzlich gegen den **unveränderten** Stand `f52be4b`
ausgeführt: 10 davon schlagen dort fehl (T1B-02: 4, T1B-03: 4, T1B-07: 2) und bestehen auf dem
korrigierten Stand.

## Befunde

| ID | Ursache | Korrektur | Testnachweis | Restrisiko |
|---|---|---|---|---|
| **T1B-01** P1 Image nicht baubar | Frontend-Tests importierten `docs/alpha4/example-registry.json`; die Frontend-Stage des Dockerfiles enthält nur `frontend/`. Lokal im vollen Checkout unsichtbar. | Fixture `frontend/test/fixtures/example-registry.json` (verbatim) im Frontend; kein Import mehr außerhalb von `frontend/`. Python-Test erzwingt Byte-Gleichheit mit der dokumentierten Registry und verbietet `docs/`-Importe. Dockerfile bleibt unverändert, `npm run check` prüft weiter Tests. | `tests/test_scope_packaging.py::test_frontend_example_fixture_matches_documented_registry`; lokal die Docker-Stage nachgestellt (nur `frontend/` kopiert → `npm ci && npm run check && npm run build` grün). | Docker/QEMU nicht lokal verfügbar: **beide Image-Jobs und der amd64-Container-Smoke sind erst durch den CI-Lauf nach dem Push nachgewiesen.** |
| **T1B-02** P1 erneute Draft-Auswahl verliert Änderungen | `doc.open()` ersetzte immer Konfiguration und Undo-Stack; Picker, Studio-Liste und Draft-Anlage riefen es ohne Prüfung. | `open()` ist für den bereits geöffneten Draft ein No-op (außer ausdrücklich `reload`); neues `requestOpen()` fragt bei ungespeicherten Änderungen über `SwitchDialog`; alle Aufrufer (Picker, Studio, Draft-Anlage) nutzen es. | `draftSafety.test.tsx` (5): gleicher Draft über Picker und „Bearbeiten“ erhält Änderung und Undo/Redo; Wechsel fragt (Abbrechen erhält, Bestätigen wechselt); sauberer Wechsel sofort; Draft-Anlage verwirft nichts still. | `Server-Stand neu laden` für den offenen Draft gibt es nur über den Konfliktdialog; ein eigener „Neu laden“-Knopf fehlt (bewusst nicht ergänzt). |
| **T1B-03** P1 Prüfung ≠ Aktivierung | `useCheck.start` hielt `run()` des ersten Renders fest; Dialog blieb bei Draft-Wechsel gemountet, Ergebnis/Bestätigung blieben. | Prüfung ist an *Subjekt* (Draft-ID + Version bzw. Revision+Prüfsumme) und die geprüfte aktive Revision gebunden; `run` über Ref (aktuell, keine Re-Check-Schleife); Ticket verwirft späte Antworten; Bestätigung gilt nur für `(Subjekt, aktive Revision)`; vor der Validierung wird `draft_version` am Server verglichen (Abweichung → „Prüfergebnis veraltet“); Wechsel der aktiven Revision (Live-Kanal) macht ein fertiges Ergebnis ungültig; Dialoge werden nur bei Bedarf gemountet und nach Draft/Version geschlüsselt. | `lifecycle.test.tsx` (+4): A→B ohne Remount (validiert B, nennt B, aktiviert B); Wechsel bei offenem Dialog verwirft Ergebnis und Bestätigung; veraltete Draft-Version; neue aktive Revision per Live-Snapshot. | Server-OCC bleibt die letzte Instanz; die UI zeigt jetzt nur, was zur aktivierten Version gehört. |
| **T1B-04** P1 Objektwerte nur per JSON | Objekt-Literale, Map-Ergebnisse und Command-Argumente vom Typ `object` hatten nur eine JSON-Textarea. | Wiederverwendbarer `ValueEditor` (string, number, boolean, null, Objekte mit Schlüssel/Wert-Zeilen, Listen, beliebig verschachtelt, gemischte Typen, Typwechsel mit sinnvoller Umwandlung, Umbenennen/Duplikatschutz, Reihenfolge); `TypedValueEditor` nutzt ihn für `object` (erlaubt alles außer null). JSON ist nur eine optionale Zusatzansicht. | `valueEditor.test.tsx` (9); `build-example.test.tsx`: `test.flow` baut das Objektliteral jetzt grafisch (kein `paste` mehr); `manualFirst.test.tsx`. | Sehr große Strukturen werden nicht virtualisiert. |
| **T1B-05** P2 Katalog zeigt Struktur als Text | Katalogeditor kannte nur Text/Zahl/Bool; `[object Object]`. | Katalogeinträge nutzen den `ValueEditor` (jeder JSON-Typ, Typ bleibt erhalten, kein String-Zwang). | `rules.test.tsx` (Anzeige importierter Objekt/Liste/Null ohne `[object Object]`, Bearbeitung ohne JSON); `manualFirst.test.tsx`: Katalog mit Objekt/Liste/Null → Speichern → Export → Reimport → gleiche Typen und Inhalte. | – |
| **T1B-06** P2 dynamische Schemas | `SchemaForm` kannte nur nullable-Unionen; offene Objekte/übrige Unionen → Raw-JSON; spezialisierte Editoren zeigten neue Schema-Eigenschaften nicht. | `SchemaForm`: `$ref`, `allOf`-Merge, nullable und allgemeine Unionen (Variantenwahl mit aktiver Variante und Standardwerten), offene Objekte mit typisierten Zeilen, Listen ohne `items`, rekursive Strukturen (Tiefengrenze), Diskriminator vor Union, Rest → grafischer `ValueEditor`. Neu `Extras` + `SchemaProvider`: Jeder spezialisierte Editor (Regeln, FieldSchema, Definition, Eingänge, Ausgabeschema, Maschine/Transition/Befehl, Source/Freshness, Binding/Adapter/Transform, Katalog, Contract, Dependency) zeigt vom Schema deklarierte, aber nicht selbst gerenderte Eigenschaften und dem Schema unbekannte Member (erhalten, editier- und entfernbar). | `schemaDynamic.test.tsx` (8) mit synthetisch variierten Capabilities: zusätzlicher Operator (String/Zahl-Union, offenes Objekt, Varianten-Union, Liste, rekursive Regel), neue Eigenschaft an `CompareRule` und `FieldSchema`, unbekannte Member, rekursiver Baum, offenes Objekt mit Wert-Union. | Es werden nur Capabilities verarbeitet, die der Server meldet; keine Operatoren erfunden. Bedingte Schema-Anforderungen (`if/then`) bleiben Hinweise, der Server validiert. |
| **T1B-07** P2 Token im Mutation-Cache | `useMutation` behielt die Antwort samt Token im Cache. | Rotation ist kein Query-Mutation mehr (`rotateToken()`), Antwort nur im Komponentenzustand; beim Ausblenden/Unmount gelöscht; `completion_unconfirmed` unverändert; weiterhin nie automatisch wiederholt. | `admin.test.tsx`: Query- und Mutation-Cache enthalten das Token nie (angezeigt, ausgeblendet, unmounted; beide Audit-Zustände). | JS-Strings lassen sich nicht aktiv überschreiben; die Referenz endet mit dem Komponentenzustand. |
| **UX-01** P3 Textkatalog | Katalogeditor erschien nur für Enum oder nichtleeren Katalog. | Für Text gibt es „Auf feste Textwerte einschränken“ → Katalogeditor; leerer Katalog wird nicht geschrieben. | `valueEditor.test.tsx`. | – |

## Zusätzlich gefundene und behobene Punkte

* **Ingress-Rate-Limit (echter Befund aus dem Engine-Lauf):** Der Server begrenzt alle Ingress-Anfragen
  gemeinsam auf 120/min. Die Workbench pollte teils alle 5 s. Polling jetzt 15 s (Live-Werte kommen per
  WebSocket), Auto-Validierung 2 s Debounce und bei `429` automatischer Wiederholversuch;
  `429` ist ein eigener, verständlich erklärter Fehlerart (`rate_limited`). Das Limit selbst ist
  unverändert (Backend); das Review-Harness hebt es nur für skriptgesteuerte Läufe an.
* Stale-Chunk nach App-Update: `RouteError` (aus dem ersten Durchgang) erklärt und bietet Neuladen.
* Graph: `fitView` mit Rand, Knoten sind in echtem Chrome sichtbar (siehe unten).

## Manual-first- und Engine-Nachweis

* `manualFirst.test.tsx` (echte Anwendung, Fake-HTTP mit realen OCC-Regeln): Die Alpha-4-Beispielregistry
  wird aus einem **leeren Draft ausschließlich über Bedienelemente** aufgebaut (Dependency, Sources,
  Bindings, fünf Definitionen inkl. verschachtelter Regeln, Objektwert und State Machine, sechs
  Contract-Instanzen), gespeichert (exakt gleich der Beispieldatei), validiert und aktiviert. Zweiter Test:
  Import → grafische Bearbeitung → Speichern → Export → Reimport, verlustfrei.
  Kein JSON-Shortcut, keine Pointer-Helfer; nur der Import-Weg nimmt JSON entgegen (das ist sein Zweck).
* `e2e.test.tsx` (`npm run test:e2e`): dieselbe UI gegen die **echte API und Engine** einer isolierten,
  frischen In-Memory-Instanz (`dev/workbench_demo.py --feed`): Aufbau per Bedienung, echte Validierung,
  Aktivierung, Beobachtung über den echten WebSocket (Snapshot, fortlaufende Deltas, Revisionswechsel),
  Export/Reimport, semantische Änderung (neue Definitionsversion mit Instanz-Migration), Aktivierung,
  Rollback als neue Revision, Aktivierungs-Historie, OCC-Konflikt einer zweiten Sitzung. Gleichheit
  serverseitig normalisierter Dokumente wird über das Server-Diff beurteilt, nicht über Rohvergleich.
  Läuft nur mit `TERRA_E2E_URL`; CI-Job `workbench-e2e` startet eine frische Instanz. Keine Einhornzentrale.
* Sichtbares Rendering: echtes Chrome (headless, DevTools-Protokoll) gegen die isolierte Instanz — Graph:
  8 Knoten/7 Kanten sichtbar, Knoten wählen, Abhängigkeiten (vorgelagert/nachgelagert transitiv), Nachbarschaft
  (4 Knoten), Sprung in die Contract-Detailseite.

## Offen (bewusst nicht behauptet)

Firefox; echte HA-Ingress-/Supervisor-Einbettung; reale Discovery-Größe/Latenz; Barrierefreiheit
(keine Messung); menschliche Live-Abnahme; beide Supervisor-Images und der Container-Smoke (CI nach Push).
