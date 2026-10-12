# Terra Workbench (Phase 1B)

Administrative Weboberfläche der App: React-19-Ersatz der Engineering-UI aus Alpha 4. Nur
Frontend; Backend, API, Legacy-Integration und Engine sind unverändert. Basis: Release
`v1.0.0a4`. Stand: Implementierung zur unabhängigen Prüfung — **keine** Live-/Ingress-Abnahme.

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
- **Drafts sind nie live.** Aktivierung/Rollback nur über Dialog mit Bestätigung und beiden
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
| Schriften | `@fontsource-variable` (gebündelt) | keine Remote-Fonts; CSP `default-src 'self'` |

Ingress/CSP: relative Basis (`./`), alle Assets mit Content-Hash unter `assets/` (Server:
`immutable`), `assetsInlineLimit: 0` (keine `data:`-URIs), kein Inline-Script. `npm run
verify:dist` prüft das am Build (läuft in CI). Gegen den echten Server geprüft: Header, Laden
unter der CSP ohne Konsolenfehler, relative `./api/v1/`-Aufrufe und WebSocket.
Es werden keine Tokens/Zugangsdaten im Browser gespeichert (nur: Navigationszustand,
geöffnete Draft-ID in `sessionStorage`, Menü eingeklappt).

## Bereiche (Routen)

| Route | Inhalt |
|---|---|
| `#/` | Übersicht: Readiness, Bedingungen, Installation, Contract-Zahlen, Probleme, Ereignisse |
| `#/contracts`, `#/contracts/:id` | Instanzen: Liste/Filter, Live-Zustand, Konfiguration, Abhängigkeiten |
| `#/definitions`, `#/definitions/:typeId/:version` | Definitionen (getrennt von Instanzen), Sperre aktivierter Versionen, „Neue Version“ mit Instanz-Migration |
| `#/sources` | Sources, Bindings (HA-Entity-Picker, MQTT, Transform), Kataloge, Dependencies |
| `#/registry`, `#/registry/drafts/:id` | Drafts, Revisionen, Validierung, Diff/Impact, Aktivierung, Rollback, Import/Export, JSON-Experte |
| `#/graph` | Quellen/Contracts/Ergebnisse, Nachbarschaft, Suche, Sprung in Editor/Diagnose |
| `#/diagnostics` | Live-Zustand, Contract-Diagnose (Explain, Temporal, Restore, Machine), Historie, Publikationen/Lücken, Evidence, Commands |
| `#/admin` | Installation/Einrichtung, Readiness, Bridge-Diagnose, Rollen/Tokens, Audit |

Der Einrichtungsassistent ist mit identischen Texten, CSRF-Handling (`X-Setup-CSRF`) und
Bestätigungen portiert (`src/setup/`), inkl. der sieben Alt-Tests.

## Capability-Abdeckung

| Alpha-4-Bestandteil | Editor / Ansicht | Nachweis |
|---|---|---|
| Dependencies | `DependencyEditor` | `build-registry.test` |
| Sources, Freshness-Modi (bedingte Felder aus Schema), `value_schema` | `SourceEditor` | `build-registry.test` |
| Bindings: `ha_state`, `ha_attribute`, `mqtt`, Transformationen, Entity-Picker | `BindingEditor`, `EntityPicker` | `build-registry.test`; Picker nur manuell |
| Catalogs | `CatalogEditor` | `rules.test` |
| Definition: Metadaten, Eingänge, Ausgabeschema, Projektion, `refresh_inputs` | `DefinitionEditor` | `build-example.test` |
| Regeln: input, ref, literal, and/or/not, compare, map, first_match, bucket, formula, fusion, temporal (stable_for/dwell/grace/edge/delta/age), machine, not_applicable | `RuleEditor` (rekursiv) | `build-example.test`: `test.condition/either/timed/flow` werden nur per GUI nachgebaut = Beispiel; `rules.test`: map, first_match, bucket, not_applicable, eindeutige Stateful-IDs, unbekannter Operator, zustandslose Guards, Sperre (dwell/edge/delta/age nur über dieselbe Temporal-Maske, nicht einzeln getestet) |
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

## Qualität und Prüfung

```
cd frontend
npm ci && npm run check && npm test && npm run build && npm run verify:dist
```

Zusätzlich (Review-Hilfe, ohne HA/PostgreSQL): `dev/workbench_demo.py` startet die **echte** API
und Engine auf dem In-Memory-Store und liefert `frontend/dist` aus
(`uv run python dev/workbench_demo.py --seed`). Es aktiviert nichts in einer echten Installation.

## Offene Punkte

Siehe die Abschlusslieferung im PR; kurz: keine Browser-Abnahme in Firefox, keine
HA-Ingress-/Supervisor-Prüfung, Graph-Layout nicht in einem sichtbaren Browser verifiziert,
keine automatisierte Barrierefreiheits-Messung, HA-Entity-Picker nur gegen den Fake geprüft.
