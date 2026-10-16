# Terra — Arbeitsoberfläche (Alpha 7)

Administrative Weboberfläche der App auf React 19. Alpha 7 ordnet die vorhandenen
Editoren und Diagnosewege nach Aufgaben. Basis ist `main@4687c35` / `v1.0.0a6`.
Verbindlich: [Issue #19](https://github.com/levtos/core_contract_app/issues/19),
[PR #20](https://github.com/levtos/core_contract_app/pull/20) und der dort benannte UX12-Bericht.
Ziel: Firefox und Google Chrome am Desktop mit 1920×1080; keine mobile Umgestaltung.
Die [Abnahmematrix](alpha7/ABNAHME.md) führt jeden Punkt P1–P13, A.11 und Top-15
mit Umsetzung, Test und Bildnachweis. Technischer Nachweis ist keine Live-Abnahme.

## Prinzipien

- **Manual-first:** Alles, was Alpha 4 akzeptiert, ist grafisch erstellbar, bearbeitbar und
  verwaltbar. JSON ist ein optionaler Expertenweg (Draft-Ganzdokument, Definition), nie Pflicht.
- **Capability-gesteuert:** Operatoren, Formeln, Fusionsstrategien, Temporal-Operationen,
  Enums, bedingte Pflichtfelder (Freshness/Adapter/Transform) und Parameterformulare von
  Typen kommen aus `/capabilities` bzw. `/types`. Unbekannte Operatoren erscheinen im
  generischen Schemaformular, Unbekanntes als rohes JSON — nichts wird stillschweigend gelöscht.
- **Der Server validiert:** Der Browser enthält keine zweite Regel-/Validierungsengine.
  Fehler (`issues[]`, JSON-Pointer) werden am betroffenen Feld und in einer Liste mit
  Sprungziel gezeigt. Statische Diff-/Impact-Anzeige stammt vom Server.
- **Entwürfe gelten erst nach Übernehmen.** Live ansehen und Bearbeiten stehen in der
  Kopfzeile. Anlegen startet bei Bedarf automatisch einen Entwurf und bleibt auf der Seite.
  Übernehmen/Zurücksetzen nur über Dialog mit Bestätigung und beiden
  Versionsprüfungen (`draft_version`, `expected_active_revision`); Konflikte werden gezeigt,
  nie verdeckt oder automatisch wiederholt.
- **Ehrliche Zustände:** `unknown` ist weder `false` noch `off`; Readiness ≠ Qualität;
  Frische/Quality kommen vom Server; leere Konfiguration, unvollständige Einrichtung,
  eingeschränkte Quelle, Verbindungsabbruch, Persistenzfehler und Systemstörung sind getrennt
  benannte Bedingungen (`src/lib/status.ts`).

## Stack und Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| UI | React 19, TypeScript strict (`noUncheckedIndexedAccess`), Vite 8, Tailwind 4 | Vorgabe des Auftrags |
| Komponenten | Base UI (`@base-ui/react`) hinter eigenen schmalen Wrappern (shadcn-Stil, Tokens in `index.css`), `lucide-react` | zugänglich (Dialog, Tabs, Switch, Checkbox, Tooltip), kostenlos; native `<select>` für Firefox-Robustheit |
| Routing | `react-router` 7 mit **Hash-Router** | Der statische Ingress-Server hat keinen SPA-Fallback und ein unbekanntes Präfix; Hash-URLs funktionieren unter jedem Basispfad |
| Daten | TanStack Query | Cache, Invalidierung nach Aktivierung, Polling nur für Diagnose |
| Tabellen / Graph | TanStack Table 8, `@xyflow/react` 12 + `@dagrejs/dagre` (lazy Chunk) | Vorgabe; Layout automatisch, kein freies Programmieren nötig |
| Formulare | eigene kontrollierte Editoren auf dem Roh-JSON-Dokument; keine Form-Bibliothek | Die Datenform ist ein rekursiver, schema-getriebener Baum; Pointer-genaue Fehler und Verlustfreiheit unbekannter Member sind so einfacher |
| Live | eigener `LiveStore` (WebSocket Protokoll 1) | Snapshot → Deltas mit Epoche/`prev_seq`-Prüfung, Resync, Backoff, `stale`-Kennzeichnung, `installation_mismatch` |
| Flexible Panels | `@atlaskit/pragmatic-drag-and-drop` (DOM-Core) | native Drag-Ereignisse; Tastatur-/Touch-Buttons und Breitenwahl; stabile Editor-Komponenten, kein Window-Management |
| Schriften | `@fontsource-variable` (gebündelt) | keine Remote-Fonts; CSP `default-src 'self'` |

Ingress/CSP: relative Basis (`./`), alle Assets mit Content-Hash unter `assets/` (Server:
`immutable`), `assetsInlineLimit: 0` (keine `data:`-URIs), kein Inline-Script. `npm run
verify:dist` prüft das am Build (läuft in CI). Gegen den echten Server geprüft: Header, Laden
unter der CSP ohne Konsolenfehler, relative `./api/v1/`-Aufrufe und WebSocket.
Tokens/Zugangsdaten werden nicht persistent im Browser gespeichert. Persistiert
werden die geöffnete Draft-ID in `sessionStorage`, Layout-Metadaten und Menüstatus
pro Installation/Ansicht in `localStorage` sowie ausschließlich Request-Zeitmetadaten
in IndexedDB für das gemeinsame Tab-Budget. Layout-Metadaten enthalten keine
Registry-Inhalte. „Layout anpassen“ bietet Verschieben, Breitenwahl und Reset;
Editorzustand und Sicherheitsdialoge bleiben erhalten.

## Module und Unterseiten (Hash-Routen)

| Route | Inhalt |
|---|---|
| `#/` | Drei Blöcke: Schnellaktionen, Verträge/Probleme, letzte relevante Ereignisse |
| `#/contracts/list/all` | Meine Verträge: Name, Wert, Zustand, Quelle und Filter |
| `#/contracts/select/contract`, `#/contracts/view/:id` | Vertrag wählen; Wert jetzt, Warum, Woher, Verlauf, Befehle und Konfiguration |
| `#/contracts/import/json` | Vertrag als JSON/Importtext in einen neuen Entwurf übernehmen und prüfen |
| `#/contracts/relations/graph` | Zusammenhänge: lesbarer, verschiebbarer Graph; Entwurf und Live getrennt |
| `#/templates/own`, `#/templates/built-in` | Eigene und eingebaute Vorlagen |
| `#/templates/details/:typeId/:version` | Vorlageneditor, Sperre übernommener Versionen und „Neue Version“ mit Vertragsauswahl |
| `#/sources/devices` | Geräte aus Home Assistant, geführte Anlage und Quellenumzug |
| `#/sources/bindings` | Verknüpfungen und ausdrückliche Umwandlungen |
| `#/sources/catalogs`, `#/sources/dependencies` | Wertelisten und erweiterte Abhängigkeiten |
| `#/changes/drafts`, `#/changes/drafts/:id` | Entwürfe und Entwurfsdetails mit Prüfung und Vergleich |
| `#/changes/versions` | Unveränderliche Versionen mit Zeit, Akteur, Notiz und Zurücksetzen |
| `#/changes/transfer` | Import/Export auf eigener Seite |
| `#/settings/system` | Systemstatus |
| `#/settings/installation` | Installation und Einrichtung |
| `#/settings/connections` | HA-Anbindung, Datenbank und MQTT |
| `#/settings/keys` | Zugangsschlüssel |
| `#/settings/log` | Protokoll einschließlich Entwurfsaktionen |
| `#/settings/diagnostics` | Sechs Expertenbereiche: Live-Zustand, Vertragsdiagnose, Verlauf, Veröffentlichungen/Lücken, Nachweise, Befehle |

Alte Routen leiten mit ihren Auswahl-/Fehlerparametern auf die neue Aufgabe um.
„Layout anpassen“ liegt im kleinen ⋯-Menü; die untere doppelte Einrichtungsaktion entfällt.
Die Kopfplakette zeigt jede offene Bereitschaftsbedingung mit einem Lösungslink.

Der Einrichtungsassistent behält CSRF (`X-Setup-CSRF`), ausdrückliche Bestätigungen
und die Korrekturen aus Alpha 6. Das Öffnen oder Prüfen der Oberfläche ist keine
Freigabe, eine Installation oder Datenbank zu ändern.

## Alpha-7-Pakete und technische Grenzen

- [Geräteführung](alpha7/GERAETEFUEHRUNG.md): automatische Abhängigkeit, Quelle,
  Verknüpfung und passende ausdrückliche Umwandlung; höchstens sechs Klicks für den ersten Temperaturvertrag.
- [Quellenumzug](alpha7/QUELLENUMZUG.md): neue Kennung und gezielte Vertragsauswahl,
  alte Quelle/Historie erhalten; komplexe eigene Regeln werden nicht still uminterpretiert.
- [Ablauf-Neustart](alpha7/ABLAUF-NEUSTART.md): angenommene ADR 0004, Standard aus,
  ausschließlich Administrator und definierter Startzustand; Audit, Bestätigung und Datennachweis.
- [Versionen](alpha7/VERSIONEN.md): ausdrücklich freigegebene redaktionelle Metadaten,
  außerhalb von Konfiguration und Prüfsumme, ohne Änderung der Auswertungsregeln.
- [Farben und Sprache](alpha7/FARBEN-SPRACHE.md): deutsche Texte aus `de.json`,
  graues Unbekannt, neutrale Dekoration und rechnerisch geprüfte AA-Kontraste.

Fachliche Backend-Erweiterungen betreffen ausschließlich Quellenumzug und Ablauf-Neustart;
die Geräteführung verwendet die bestehenden Registry-Modelle und eine ausdrücklich
angeforderte, nur lesende Admin-Vorschau von HA-Metadaten. Keine Änderung an Legacy,
HA-Konfiguration, Einhornzentrale oder `en.json`. Keine Installation oder DB-Reset.

## Capability-Abdeckung

| Alpha-4-Bestandteil | Editor / Ansicht | Nachweis |
|---|---|---|
| Dependencies | `DependencyEditor` | `build-registry.test` |
| Sources, Freshness-Modi (bedingte Felder aus Schema), `value_schema` | `SourceEditor` | `build-registry.test`, `manualCoverage.test`, Engine-E2E mit allen vier Modi |
| Bindings: `ha_state`, `ha_attribute`, `mqtt`, Transformationen, Entity-Picker | `BindingEditor`, `EntityPicker` | `build-registry.test`; Picker nur manuell |
| Catalogs | `CatalogEditor` | `rules.test` |
| Definition: Metadaten, Eingänge, Ausgabeschema, Projektion, `refresh_inputs` | `DefinitionEditor` | `build-example.test` |
| Regeln: input, ref, literal (inkl. Objekt-/Listenwerte über den `ValueEditor`), and/or/not, compare, map, first_match, bucket, formula, fusion, temporal (stable_for/dwell/grace/edge/delta/age), machine, not_applicable | `RuleEditor` (rekursiv) | `build-example.test`, `rules.test`, `manualCoverage.test`: alle sechs Temporal-Operationen und zusätzliche Operatoren separat grafisch erstellt und in Engine-E2E über die echte API validiert |
| State Machine: Zustände, Transitionen, Guards, Befehle/Argumente, `argument_equals`, Episoden, Sessions, Deadline, Reinit | `MachineEditor` | `build-example.test` (`test.flow`) |
| Contract-Instanzen, Referenzen, Paket-Typ-Parameter (Schema-Formular) | `ContractEditor`, `SchemaForm` | `build-registry.test` |
| Unveränderliche Versionen | Sperre + „Neue Version“ | `versioning.test` |
| Draft-Lifecycle, OCC, Aktivierung, Rollback | Studio-Seiten/Dialoge | `lifecycle.test`; echter Lauf gegen die Engine (siehe unten) |
| Diff/Impact, Validierungsfehler am Feld | `DiffView`, `IssueList`, `Fld` | `api.test`, `lifecycle.test` |
| Capabilities `history.kinds` (10), Cursor, UTC-Filter | `HistoryTab` | `diagnostics.test` |
| Explain, Evidence-Referenzen (404 explizit), Temporal/Restore, Machine-Zustand | `ExplainPanel`, `ContractDiagnosis`, `EvidenceLookup` | `diagnostics.test`; echte Daten im Browser gelesen |
| Commands (typisiert, Serverzeit, stabile ID) | `CommandsPanel` | `diagnostics.test` |
| Token-Rotation (`completion_unconfirmed`, nie automatisch wiederholen) | `AdminPage` | `admin.test` |
| Audit inkl. unbestimmter Rotationen | `AdminPage` | `admin.test` |
| Snapshot/Delta/Resync/Reconnect | `LiveStore` | `live.test` |
| Layout, Navigation und erhaltener Editorzustand | `PanelLayout`, `Shell` | sechs React-Abläufe in `PanelLayout.test`, einschließlich nativer Drag-Adapter und echtem Source-Editor |

## Qualität und Prüfung

```
cd frontend
npm ci && npm run check && npm test && npm run build && npm run verify:dist
```

Engine-End-to-End (isolierte In-Memory-Instanz, nie gegen eine Installation):

```
uv run python dev/workbench_demo.py --feed --interval 1 --port 8123   # frische, leere Instanz
cd frontend && TERRA_E2E_URL=http://127.0.0.1:8123 npm run test:e2e
```

`dev/workbench_demo.py` startet die **echte** API und Engine auf dem In-Memory-Store und liefert
`frontend/dist` aus (`--seed` aktiviert die Beispielregistry, `--feed` speist `source.a`/`source.b`).
Es aktiviert nichts in einer echten Installation und hebt das Ingress-Rate-Limit nur für Skriptläufe an.

Werte (`ValueEditor`): Text, Zahl, Wahrheitswert, Null, Objekte und Listen, beliebig verschachtelt; JSON ist nur
eine optionale Zusatzansicht. Dynamische Schemas: `SchemaForm` + `Extras` (siehe
[review-resolution.md](review-resolution.md)).

## Review und Freigaben

Die reproduzierbare Bildprüfung liegt in `frontend/scripts/browser-review.mjs`.
Nach `npm ci`, `npx playwright install firefox` und dem Frontend-Build startet sie
eigene In-Memory-Prozesse auf den freien Loopback-Ports 8196 und 8198 und beendet
nur diese Prozesse. Beispiel aus `frontend/`:

```
node scripts/browser-review.mjs --baseline C:/path/to/alpha6 --browser both --phase both
```

Der Vergleichscheckout muss den exakten freigegebenen Alpha-6-Dateibaum enthalten;
das Skript prüft dies. Es verwendet installiertes **Google Chrome** und einen
**Firefox-/Gecko-Testbuild von Playwright**, jeweils mit frischem Profil im
Headless-Modus, 1920×1080 CSS-Pixeln und Pixelfaktor 1. PNG-Dateien bleiben
unveränderte Browseraufnahmen. Das Manifest benennt Browserversionen, Quellstand,
Routen, Prüfergebnisse und SHA-256 jeder Aufnahme. Eine sichtbare Prüfung des
persönlichen Browserprofils oder eine reale HA-Ingress-Abnahme ist damit nicht behauptet.

Die historischen Befunde T1B-01…07 und UX-01 stehen in
[review-resolution.md](review-resolution.md). Die aktuelle Alpha-7-Matrix enthält
die konkret durchgeführten Tests und Browserbilder sowie jede begründete Auslassung.
Anschließend folgen Claudes UX-Nachtest und Bennis Live-Abnahme. Echte
HA-Ingress-/Supervisor-Einbettung, reale Discovery-Größe und vollständige
Barrierefreiheitsabnahme bleiben eigenständige Nachweise. Merge, Tag, Release,
Image-Publish und Installation erfordern Bennis ausdrückliches neues Go.
