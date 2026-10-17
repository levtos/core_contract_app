# Akte-Gap-Audit 2026-10 — Rückverfolgung Entscheidungsakte §30 → Plattform

**Art:** reine Analyse und Dokumentation. Kein Produktivcode, kein Release, keine Live-Aussage.
**Stand:** 2026-10-17 · **Code-Basis:** `main@a08a51d` (App `1.0.0a7.post1`, „Terra“) · **Agent:** Claude
**Ziel:** Vor Beginn der Beta (= Phase 2, „nur noch Verträge eintragen“) darf keine Fähigkeit fehlen,
die bestätigte Entscheidungen der Fachakte voraussetzen. Die Build-Spezifikation hat in §30 „alle
realen Domain-Contracts“ vertagt; diese Matrix prüft, ob dabei Plattform-Fähigkeiten mit vertagt wurden.

**Quellen (nur gelesen):**

- Fachakte `Core_Contracts_Master_Entscheidungsakte_Phase4_Auditrevision.md` (lokal, privat; Stand
  P4-65), maßgeblich §30 einschließlich §30.12a–q, §30.13 und §30.14; ergänzend M07-09/10, M12-11,
  M14-01…14, M19-18/19, M21-17.
- `Phase4_Entscheidungsprotokoll.md` (P4-17a, P4-32, P4-36, P4-38, P4-60), `Phase4_Offene_Punkte.md`,
  `Core_Contracts_Profile_Delta_Audit_2026-10-07.md`.
- Repository: `docs/platform-alpha1/build-specification.md` (§6–§18, §26, §30, §31),
  `docs/adr/0003-declarative-platform.md`, `src/core_contracts/**`, `custom_components/core_contracts_bridge/`.
- Zum Abgleich der zu portierenden Fachfunktionen: `Levtos/benni-core-state@c9408fa`
  (`logic.py`, `coordinator.py`, `wake_planning.py`).

**Methodik:** Jede BESTÄTIGTE ENTSCHEIDUNG M30-01…M30-46 wurde mit ihren Fortschreibungen (P4-47…P4-65)
gelesen, die vorausgesetzte Fähigkeit abgeleitet und gegen Spezifikation und Code geprüft. Code-Belege
stehen als `Datei:Zeile` relativ zur Repository-Wurzel. Tests wurden nicht ausgeführt; „vorhanden“
heißt: Mechanismus im Code nachweisbar, nicht: fachlich für den späteren Contract erprobt.

**Prozessvermerk:** lean-ctx (CTX) war in der Umgebung verfügbar, wurde für diese Analyse aber nicht
genutzt; gelesen wurde mit den nativen Werkzeugen. Das ist keine technische Evidenz.

## 0. Kurzfazit

1. Das Fundament (fünf Status, Reasons, Held-Propagation, Grace, `stable_for`, Edge/Latch, Fusion,
   SM mit Episoden/Sessions/Commands, Restore, Revisionsaktivierung, Dependencies, Heartbeat-Freshness,
   Installationsisolation) ist vorhanden und trägt die meisten Entscheidungen.
2. **Es fehlen Plattform-Fähigkeiten (Art A), ohne die mehrere bestätigte Core-Contracts nicht
   „nur eingetragen“ werden können.** Die Startliste G1–G11 ist bis auf G11 (Fach-UX, Art B) als
   Art-A-Lücke bestätigt; neun weitere Lücken G12–G20 kommen hinzu.
3. Kritischster Pfad: **G1 Uhrzeit/Kalender als Eingang** — ohne ihn sind `day_phase`, `wake.plan`,
   Waking-Eintritt, Simulation, saisonale Außenhelligkeit und erwartete Strahlung nicht baubar.
4. Größter Einzelblock: **G4 Katalogpflege im Betrieb** (Title-Classifier und LG-Source-Registry).
5. Zwei Punkte sind keine reine Bauaufgabe, sondern Entscheidungen: **G17** (Spezifikation §13 und
   Akte P4-65 §7 widersprechen sich beim HA-Ausfall) und **G19** (Instanzparameter vs. neue
   Definitionsversion bei Benutzer-Schwellen).
6. Die Phase-1-Scope-Sperren (`test.*`-Namespace, `fixture`-Pflicht, Test G13) müssen vor der Beta
   bewusst gelöst werden (**G18**).

## 1. Legende

**Status:** `vorhanden` · `teilweise` · `fehlt` · `bewusst offen (§30.14)` · `außerhalb Mimir`
(Policy/Apply, nicht Core). „unsicher“ markiert eine nicht abschließend belegte Einordnung.
**Art:** **A** Plattform-Fähigkeit · **B** Fachfunktion im Code je Domäne · **C** Fachvertrag/Daten
in der Beta (Bindings, Kataloginhalte, Schwellen, Parameter-Audit).
„Mimir“ bezeichnet die künftige App; der heutige Stand heißt „Terra“.

## 2. Rückverfolgungsmatrix M30-01 … M30-46

| ID | Entscheidung (Kurzform, inkl. Fortschreibungen) | Verlangte Fähigkeit | Ort im Code/Test | Status | Art | Beleg / Anmerkung |
|---|---|---|---|---|---|---|
| M30-01 | fünf Zustände, Reason-Pflicht, keine Ersatz-Fachwerte; `unknown`/`unresolved` **zentral sichtbar (HA-Benachrichtigungen/Protokolle)**; A-04 Held-Propagation | Status-Invarianten, generischer Reason-Katalog, Held-Propagation, zentrale Problemanzeige **mit HA-Benachrichtigung** | `src/core_contracts/quality.py:48`; `src/core_contracts/schema.py:169`; `src/core_contracts/capabilities.py:71`; `src/core_contracts/api.py:360`; `src/core_contracts/runtime.py:1313` | teilweise | A | Status/Reasons/held vorhanden; Problemliste nur als Pull-Endpunkt, Log `quality_transition`. HA-Benachrichtigung fehlt → **G7** |
| M30-02 | nicht auflösbarer Konflikt → `unknown` + `degraded` + `conflict` | Konflikterkennung in Fusion | `src/core_contracts/engines.py:46`; `src/core_contracts/capabilities.py:358` | vorhanden | A | nur `latest` und Testfusion erkennen Konflikte; reale Strategien sind B |
| M30-03 | Flanken gegen letzten gültigen Wert; A-06 neue Baseline bei Semantikwechsel; P4-53: bestätigte Umbenennung erzeugt keine neue Baseline | Edge-Baseline mit Fingerprint; Binding-Austausch ohne Semantikwechsel | `src/core_contracts/temporal.py:87`; Spez. §9.1/§9.2/§10.3 | vorhanden; Umbenennung unsicher | A | ob der Austausch der Adapter-Adresse den Fingerprint unverändert lässt, wurde nicht geprüft |
| M30-04 | strenge Auswahl → `unresolved`; Ausnahmen nur je Contract (P4-55: `other`) | `first_match` streng | `src/core_contracts/resolver.py:79` | vorhanden | A | die `other`-Ausnahme selbst braucht **G14** |
| M30-05 | `activity_state` (eine primäre Tätigkeit, TV-Weiche über `actual_source`, A-09, P4-50…P4-59) | Auswahl, `map`, Arbitration nach Aktivierungsreihenfolge, Titel-Klassifikation | – | fehlt | B/C | Fachfunktion Phase 2; braucht G3/G4 (Titel) und M30-39 |
| M30-06 | Streaming-Session getrennt von Activity; `idle`/`paused` beenden nicht | SM-Session | `src/core_contracts/statemachine.py:56`; `src/core_contracts/declarative_models.py:199` | vorhanden (Plattform) | B | Fachfunktion fehlt |
| M30-07 | keine globale Hierarchie, lokale Abhängigkeiten | azyklischer Contract-Graph | `src/core_contracts/capabilities.py:45` | vorhanden | A | – |
| M30-08 | Producerpfade, Single-Producer, Fusion nur final (A-08) | Validierung Single-Producer | Spez. §6.4, §10.3 | vorhanden | A | – |
| M30-09 | Guards nur auf kanonische Contracts, keine Entity-IDs | typisierte Inputs über IDs | Spez. §6.4, §10.1; `src/core_contracts/declarative_models.py:184` | vorhanden | A | – |
| M30-10 | `bucket` = **n Klassen**, Hysterese optional; `map` mit `unmapped_value` | n-Klassen-Bucket | `src/core_contracts/resolver.py:101`; `src/core_contracts/declarative_models.py:100` | teilweise | A | Bucket liefert nur `bool` (zwei Klassen, feste Grenzen) → **G13**; `map` vorhanden (`resolver.py:93`) |
| M30-11 | Zeit/Gedächtnis nur in ausdrücklich stateful Bausteinen | geschlossene Operatorliste | `src/core_contracts/capabilities.py:324` | vorhanden | A | – |
| M30-12 | Latch: Pflicht-`initial`, Reset bei ungültigem Eingang | Bucket-Latch | `src/core_contracts/resolver.py:108` | vorhanden | A | Latch flüchtig (ADR 0003) |
| M30-13 | Grace nur deklariert (`tv.source` 5 s; P4-56 Presence 6 min; P4-65 Opening) | Temporal `grace` | `src/core_contracts/temporal.py:45` | vorhanden | A/C | Dauern sind C |
| M30-14 | Restart/Kontinuität, absolute Fristen, `stable_for`-Lücke; neutrale Zeitquelle Scheduler/Clock | Temporal, Restore, Clock | `src/core_contracts/temporal.py:26`; `src/core_contracts/clock.py:27`; Spez. §9.3 | vorhanden | A | Clock ist nur intern, nicht als Wahrheitsquelle nutzbar → **G1** |
| M30-15 | Formelkatalog: typisiert (Inputs mit `quantity`/`required`), versioniert, **`category`**, geführter UI-Ablauf | Formel-Metadaten je Eingang, Kategorie | `src/core_contracts/engines.py:14`; `src/core_contracts/resolver.py:123` | teilweise | A | ein gemeinsames Input-Schema für alle Argumente, keine Namen, kein `category` → **G6** |
| M30-16 | neun Bausteine, kein zehnter | Scheduler/Clock als Baustein | `src/core_contracts/clock.py:27`; `src/core_contracts/capabilities.py:27` | teilweise | A | Adapter `scheduler` wird abgewiesen; Clock liefert keine Eingänge → **G1** |
| M30-17 | feste `schema_version`, keine Auto-Migration, **`active → deprecated → retired`**, Reaktivierung; gilt für Schemas, Formel- und TC-Katalog | Versions-Lebenszyklus | `src/core_contracts/schema.py:126`; `src/core_contracts/runtime.py:160` | teilweise | A | Unveränderlichkeit vorhanden; Lebenszyklus fehlt; für `catalogs[].version` keine Unveränderlichkeitsprüfung gefunden (unsicher) → **G5** |
| M30-18 | Pre-Sleep (P4-60): 45 min, **Reset auf volle 45 min** bei Interaktion, Presence `home`, Origin-Regel, Allowlist = Konfiguration, `unknown` TV/PC = Hold | SM-Frist mit Reset innerhalb der Episode; Provenienz | `src/core_contracts/statemachine.py:90`, `:128` | teilweise | A/B | Frist entsteht nur bei `new_episode`, ein fester Wert je Maschine → **G12**; Origin-Regel → **G15** |
| M30-19 | Frist gehört Core/Bio-SM, absolute Deadline publiziert; Sleep-Herkunft unterscheidbar | Deadline im Envelope; Herkunft je Übergang | `src/core_contracts/statemachine.py:64`, `:139` | teilweise | A/B | Herkunft über `transition_reason` darstellbar; Reset/Verlängerung → **G12** |
| M30-20 | `day_phase` in Core, 9-Phasen-Logik **1:1** | lokale Kalenderzeit (Datum, Uhrzeit, Saison) als Eingang | `src/core_contracts/clock.py:105`; Quelle `benni-core-state/.../logic.py:1138`–`:1340` | fehlt | A+B | Ist-Logik ist rein kalenderbasiert („calendar-seasonal-accordion-v2“); Plattform hat nur `berlin_utc` (lokal→UTC) → **G1** |
| M30-21 | Gaming-Session-Restore, kein `persistiert = valid` | SM-Restore-Validierung | `src/core_contracts/statemachine.py:161` | vorhanden (Plattform) | B | – |
| M30-22 | Presence-Modell; P4-56/57/62 (Grace, zwei Radien, Proximity, Reconciliation) | Fusion, Grace, Schwellen als Konfiguration | – | fehlt (Fachfunktion) | B/C | Benutzerschwellen (800/100 m) → **G19** |
| M30-23 | Rollen; Schwellen nach Zweck (A-10) | keine Apply-Wirkung im Core | Spez. §5 | vorhanden | A | – |
| M30-24 | Control Permission | – | – | außerhalb Mimir | – | Policy/Apply |
| M30-25 | keine generischen Overrides; manuell nur als SM-Command **oder explizite manuelle Source (`origin = manual`)** | Command-Weg; manuelle Source | `src/core_contracts/runtime.py:1179`; `src/core_contracts/adapters/__init__.py:11`; `src/core_contracts/evidence.py:30` | teilweise | A | Commands vorhanden; manuelle Source fehlt (Adapterart fehlt, `command`-Observation ohne Eingangspfad) → **G10** |
| M30-26 | eine Architektur, App = Core-Owner, HA dünner Adapter (APP-01) | App + Bridge | Spez. §13/§14 | vorhanden | A | Versionsschema → Abschnitt 7 |
| M30-27 | TC-Katalog in Core (versionierter `map`-Katalog, Pflege im Core-Rahmen); Signal-Gesundheit ≠ Konfigurationsvollständigkeit; erwartete Strahlung Core (P4-61 K1) | persistenter, gepflegter Katalog; getrennte Vollständigkeitsachse | `src/core_contracts/registry.py:78`; `src/core_contracts/adapters/ha.py:49`; `src/core_contracts/schema.py:153` | teilweise | A+B | Katalog nur als Binding-Transform, exakter String-Schlüssel, ohne Pflege → **G4**; keine Vollständigkeitsachse → **G14**; Strahlung B |
| M30-28 | Media Policy/Apply | – | – | außerhalb Mimir | – | Core liefert nur `actual_source` (B) |
| M30-29 | Session-/Episodenkonzept bleibt | Sessions, Episoden, Episodenhistorie | `src/core_contracts/statemachine.py:49`; `src/core_contracts/history.py:12` | vorhanden | A | – |
| M30-30 | einmalige Revisionsaktivierung ohne künstliche Flanke | Aktivierungslauf | Spez. §9.5; `src/core_contracts/runtime.py:718` | vorhanden | A | – |
| M30-31 | Medien-/Gerätestate (TV aus → ATV `off`; PC-Messpunkt; PS5) | – | – | fehlt (Fachfunktion) | B/C | – |
| M30-32 | Entkopplung Geräte ↔ Wachheit; ATV-Media-Intent mit Gate; Presence E8 | – | – | B; Gate/Intent außerhalb Mimir | B | Gate-Logik ist Policy |
| M30-33 | R3 PS5-/ATV-Routing | Edge als Evidence | `src/core_contracts/temporal.py:87` | außerhalb Mimir | – | Routing ist Apply |
| M30-34 | LG-Source-Registry: **jede Raw-Source geführt, neue automatisch `manual + active`**, verschwundene `inactive`, Umbenennungsvorschlag, `unmapped_value` | betriebsgepflegter Katalog mit Laufzeit-Zugängen; `contains`-Prüfung auf `source_list` | `src/core_contracts/registry.py:78`; Spez. §10.3 („Runtime verändert die Registry nie“) | fehlt | A+B+C | → **G4**, **G3** |
| M30-35 | `tv` nur Tuner; `streaming` app-basiert; ATV-App als Subcontext | `map`, Textfeld | `src/core_contracts/resolver.py:93`; `src/core_contracts/schema.py:17` | vorhanden (Plattform) | B/C | – |
| M30-36 | `other` + `configuration_completeness = incomplete` + `activity_mapping_missing` | gültiger Wert **mit** Vollständigkeitshinweis | `src/core_contracts/schema.py:153`; `src/core_contracts/capabilities.py:85` | fehlt | A | `config_incomplete` existiert nur zusammen mit `unknown` → **G14** |
| M30-37 | Gate-Grace: Bio keine, Presence 6 min | Grace | `src/core_contracts/temporal.py:45` | vorhanden | C | – |
| M30-38 | zwei konfigurierbare Radien, Validierung `home < away`, Änderung ohne Flanke | Instanzparameter mit Relationsprüfung | ADR 0003 („declarative instance parameters are empty“) | teilweise | A/C | → **G19** |
| M30-39 | PC-Zweig, zuletzt aktivierter Zweig gewinnt, Rückfall auf verbleibenden | SM mit Edge-Eingängen oder Zeitstempelvergleich | `src/core_contracts/capabilities.py:59`; `src/core_contracts/temporal.py:87` | vorhanden (Bausteine), unsicher | B | mit SM + Edge-Contract-Inputs vermutlich abbildbar; nicht prototypisch belegt |
| M30-40 | P4-52-Flanken zählen als TV-Aktivierung | Edge | `src/core_contracts/temporal.py:87` | vorhanden (Plattform) | B | – |
| M30-41 | Bio-Modul: Flur-Flanke, Wake-Liste, **Waking-Timeout 60 min**, **`wake.plan` 1:1-Port (Kalender, Feiertage, Floor, Korridor)**, Mindestschlaf Wochenende/Feiertag, **UX-Ausnahme** | Kalender, lokale Zeit, zustandsabhängige Fristen, Frist aus Eingangszeitpunkt, manuelle Eingabe, Bedienseite | `src/core_contracts/statemachine.py:90`; `src/core_contracts/capabilities.py:373`; Quelle `benni-core-state/.../coordinator.py:261`, `:343`, `:352` | fehlt | A+B | → **G1, G2, G10, G11, G12** |
| M30-42 | K1 erwartete Strahlung Core; K3 Fail-Safe Policy; K4 Bad-Zone; K5 (für Blind superseded) | Sonnenstand/Zeit, Formeln | – | fehlt (B); K3/K5 außerhalb Mimir | B | Berechnung aus `blind_control` (C-06) → braucht G1, G6 |
| M30-43 | Ort `home/parents/away/unknown`; Proximity (Distanz, Richtung mit Quality); **Reconciliation: Trigger ≠ Evidence, begrenzte Wiederholungen, Refresh je Integration** | triggergesteuerter, wiederholter, integrationsspezifischer Refresh | `src/core_contracts/declarative.py:655`; `src/core_contracts/adapters/ha.py:401` | teilweise | A+B | Refresh nur `homeassistant.update_entity`, einmal je negativer Evidenzphase, nicht triggergesteuert → **G16** |
| M30-44 | Media-/Audio-Block; Privacy-Kontext (Date Time manuell) | manuelle Eingabe | – | überwiegend außerhalb Mimir | B/C | Bindungen HomePod/`call_active`/Privacy = C; ob Privacy selbst ein Core-Contract ist, ist unsicher; Date Time braucht **G10** |
| M30-45 | Außenhelligkeit Core (Hysterese, **saisonale Parameter**); `simulation_state` Core (Tagesphasen-Fenster); Connectivity je Abhängigkeit | Datumsabhängige Grenzen; Dependency-Modell | `src/core_contracts/registry.py:18`; `src/core_contracts/runtime.py:937` | teilweise | A+B | Dependency-Modell vorhanden; saisonale Grenzen → **G1 + G13**; Simulation braucht `day_phase` |
| M30-46 | Opening (Grace, asymmetrische Fusion, Heartbeat-Freshness, `held` je Consumer); HA = Connectivity-Eintrag, **HA-Ausfall: Freshness nach normaler Semantik**; Climate-Katalog #1–#14 (Herkunft gemessen/Ersatz/Modell/Prognose, Prognose-Reihe, Stuck, Event-Contract) | Fusionsstrategie im Code; Herkunftsart; Prognose-Gültigkeit; Stuck-Erkennung; Event-Contract; HA-Lifecycle als Eingang | `src/core_contracts/evidence.py:12`; `src/core_contracts/engines.py:41`; `src/core_contracts/runtime.py:464`, `:937`–`:944` | teilweise | A+B+C | Heartbeat vorhanden; asymmetrische Fusion = B (code-registrierte Strategie); **G8, G9, G17, G20** |

## 3. Startliste G1–G11 — bestätigt oder widerlegt

| # | Lücke | Ergebnis | Beleg |
|---|---|---|---|
| G1 | Uhrzeit-/Kalenderfunktionen als Vertragseingang (M30-20) | **bestätigt, fehlt.** Kein Eingang für lokale Uhrzeit, Datum, Wochentag oder Saison; keine Auswertung „Zeitpunkt aus Eingang erreicht“ | `src/core_contracts/clock.py:105` (nur lokal→UTC); Adapter `scheduler` abgewiesen `src/core_contracts/capabilities.py:27`; Operatorliste `src/core_contracts/declarative_models.py:131`; Spez. §18 nennt Kalenderfunktionen nur für Fristen |
| G2 | Kalender über die Bridge, `calendar.get_events` + Cache (P4-60 §9, M19-19) | **bestätigt, fehlt.** Bridge kennt nur `info` und `subscribe`; die Plattform ruft keine Services mit Antwort auf | `custom_components/core_contracts_bridge/__init__.py:131`; Spez. §13 („ruft sonst keine HA-Services auf“). Ist-Planer liest Termine aus Attributen (`benni-core-state/.../coordinator.py:343`) — der Akte-Verdacht M19-19 ist damit im Code sichtbar |
| G3 | Text-Aufbereitung lower/strip/Muster/`contains`/zusammengesetzter Schlüssel (P4-38, M19-18, M07-09) | **bestätigt, fehlt.** `map` vergleicht den exakten String; `compare` hat nur Gleichheit/Ordnung | `src/core_contracts/resolver.py:96`; `src/core_contracts/adapters/ha.py:50`; `src/core_contracts/declarative_models.py:71` |
| G4 | Pflege des Titelkatalogs im Betrieb (M30-27, M07-09/10) | **bestätigt, teilweise.** Katalog nur als Registry-Objekt für Binding-Transforms; Registry ist für die Runtime unveränderlich; Inline-`map` ≤ 256 Einträge; Registry-Dokument ≤ 2 MB; keine Sichtungen (`first_seen`, `seen_count`), kein Master/Varianten-Modell, keine Pflege-UI | `src/core_contracts/registry.py:78`; `src/core_contracts/declarative_models.py:81`; `src/core_contracts/capabilities.py:396`; Spez. §10.3. Gleicher Bedarf bei der LG-Source-Registry (M30-34) |
| G5 | Lebenszyklus `active → deprecated → retired` (M30-17) | **bestätigt, teilweise.** Unveränderlichkeit von Typ-/Definitionsversionen vorhanden, Lebenszyklusstatus fehlt | `src/core_contracts/schema.py:126`; `src/core_contracts/runtime.py:160` |
| G6 | Formelkatalog mit `category` (M30-15) | **bestätigt, teilweise.** Registrierung mit einem Input- und einem Output-Schema; keine benannten Eingänge mit `quantity`/`required`, kein `category`; einzige Formel `test.sum` | `src/core_contracts/engines.py:14`, `:55`; Einheitenprüfung „combined numeric inputs have equal units“ `src/core_contracts/capabilities.py:51` blockiert z. B. `dew_point(°C, %)` |
| G7 | HA-Benachrichtigung bei `unknown`/`unresolved` (M30-01) | **bestätigt, teilweise.** Problemliste (Pull) und Log vorhanden, keine Benachrichtigung in HA | `src/core_contracts/api.py:360`; `src/core_contracts/runtime.py:1318` |
| G8 | Erkennung „Sensor hängt fest“ (M14-05, M21-17) | **bestätigt, fehlt.** Nur Freshness-Modi, keine Plausibilitäts-/Stuck-Dimension | `src/core_contracts/evidence.py:12`; keine Fundstelle für `stuck`/`plausib` in `src/` |
| G9 | Herkunftsart gemessen/Ersatz/Modell/Prognose (Klima-Katalog #8–#13) | **bestätigt, fehlt.** `source_origin` meint die Installationsherkunft (Spez. §10.5), keine Herkunftsart; keine Gültigkeitsintervalle für Prognosen (M14-09) | `src/core_contracts/registry.py:28`; `src/core_contracts/evidence.py:32` |
| G10 | manuelle Source `origin = manual` (M30-25) | **bestätigt, teilweise.** SM-Commands vorhanden; keine manuelle Source als Eingangspfad | `src/core_contracts/adapters/__init__.py:11`; `src/core_contracts/evidence.py:30`; `src/core_contracts/runtime.py:1179` |
| G11 | Weck-Bedienseite (P4-60 §9) | **bestätigt als Lücke, aber Art B** (Fach-UX). Admin-UI ist generisch (Spez. §26). Art-A-Voraussetzung ist G10; der Command-Weg für SM existiert | Spez. §26, §30 („Workbench-/Umbrella-UX später“) |

**Fachfunktionen B der Startliste (alle bestätigt, alle fehlen):**

| Fachfunktion | Akte | Benötigt aus Art A | Beleg Ist |
|---|---|---|---|
| `wake.plan` 1:1-Port | M30-41 §9 | G1, G2, G10, G11 (B), G12 | `benni-core-state/.../wake_planning.py` (1281 Zeilen); Konfiguration Kalender, Feiertagskalender, manuelle Feiertage, Skip-Titel, Konfliktverhalten `coordinator.py:261`–`:268`; Vorlaufformel laut Akte noch zu dokumentieren |
| `day_phase` 9 Phasen | M30-20 | G1 | `benni-core-state/.../logic.py:1141` `DAY_STATE_MODEL_VERSION = "calendar-seasonal-accordion-v2"`, Phasengrenzen `:1265`, `day_context` mit Feiertag `:1338` |
| erwartete Strahlung | M30-42 K1, C-06 | G1, G6 (ggf. G9 Herkunft „Modell“) | Berechnung liegt in `blind_control`; Inputs/Generalisierbarkeit offen (C-06) |
| `apparent_temperature`, `absolute_humidity`, `dew_point` | M30-46 #10, P4-17a | G6 | nur `test.sum` registriert (`src/core_contracts/engines.py:55`) |
| Regeln des Titel-Classifiers | M19-18, M07-09/10, P4-38 | G3, G4, G5, G14 | „first-present wins“, Set-Membership mit Normalisierung, Content-Type-Gate, `contains`, zusammengesetzter Schlüssel, Serie vor App, Stash-Ausnahme, Online-Gate, Video-Fallback-Grace |

**Weitere Fachfunktionen B (nicht auf der Startliste, aus der Matrix):** Opening mit asymmetrischer
Fusion (code-registrierte Strategie, `src/core_contracts/engines.py:41`), Presence-Fusion mit Radien,
Proximity, Bio-SM, `activity_state` mit Arbitration, Außenhelligkeit, `simulation_state`,
Connectivity-Contract, Klima-Katalog #1–#14.

## 4. Zusätzliche Lücken (nicht auf der Startliste)

| # | Lücke | Akte | Beleg Code | Art |
|---|---|---|---|---|
| G12 | **SM-Fristenmodell:** Frist auf volle Dauer zurücksetzen ohne neue Episode; zustandsabhängige Dauer (Pre-Sleep 45 min, Waking 60 min); Frist/Übergang zu einem absoluten Zeitpunkt aus einem Eingang (`wake.plan.next_wake_start`); unknown-Hold einer laufenden Frist | M30-18, M30-19, M30-41 §5/§8/§9 | Frist nur bei `new_episode`, ein fester `deadline_s` je Maschine: `src/core_contracts/statemachine.py:90`, `:128`; `src/core_contracts/declarative_models.py:198`; `max_parallel_deadlines: 1` `src/core_contracts/capabilities.py:373` | A |
| G13 | **`bucket` mit n Klassen** und Grenzen aus Eingängen (saisonale Außenhelligkeitsschwellen) | M30-10, M30-45 §3 | `src/core_contracts/resolver.py:101`; Grenzen sind Literale `src/core_contracts/declarative_models.py:100` | A |
| G14 | **Konfigurationsvollständigkeit als eigene Achse:** gültiger Wert mit Hinweis (`other` + `activity_mapping_missing`), Problemliste und Übersicht getrennt nach Signal/Konfiguration | M30-27, M30-36, P4-32, M30-46 Querschnitt | Envelope ohne Vollständigkeitsfeld `src/core_contracts/schema.py:153`; Problemliste nur `unknown`/`unresolved` `src/core_contracts/api.py:367` | A |
| G15 | **Provenienz von HA-Änderungen:** eigene Policy/Apply-Aktionen positiv erkennen (HA-Context `user_id`/`parent_id`) | M30-34 §2 (W2), M30-41 §2 | Observation speichert nur `ha_context_id` `src/core_contracts/evidence.py:40`, `src/core_contracts/adapters/ha.py:244`; Bridge sendet bei `reported` nur `context_id` `custom_components/core_contracts_bridge/__init__.py:92` | A (+ außerhalb Mimir: Apply muss Kontext setzen) |
| G16 | **Reconciliation-Refresh:** durch Trigger-Contract ausgelöst, begrenzte Wiederholungen im Fenster, integrationsspezifischer Refresh-Aufruf | M30-43 §7 | `src/core_contracts/declarative.py:655`; `src/core_contracts/adapters/ha.py:401` | A |
| G17 | **HA-Ausfall-Semantik:** Akte P4-65 §7/§13: über HA bezogene Evidence verliert Freshness „nach normaler Semantik“, HA ist Connectivity-Eintrag mit Lifecycle (`ready/starting/unavailable`) als Ausführungsbedingung. Code: HA-Verbindungsverlust macht **sofort alle** HA-Sources `unknown(dependency_unavailable)`; Spez. §13 verlangt genau das für fehlende Bridge. **Widerspruch Spezifikation ↔ Akte, Entscheidung nötig.** | M30-46 §7, §13; M30-45 §7 | `src/core_contracts/runtime.py:464`, `:937`–`:944`; Spez. §13 | A (Entscheidung) |
| G18 | **Phase-1-Scope-Sperren lösen:** deklarative Typen nur `test.*`, `fixture`-Pflicht, Scope-Wächter-Tests | Spez. §6.1, §27 G13 | `src/core_contracts/declarative_models.py:235`, `:256`; `tests/test_runtime.py:140`; `tests/test_scope_packaging.py:14` | A |
| G19 | **Instanzparameter für deklarative Definitionen:** Benutzer-Schwellen (Radien, Watt, Grace-Dauern, 45 min) ändern, ohne eine neue Definitionsversion anzulegen; Relationsvalidierung (`home < away`) | M30-38 §1/§4, M30-44 §9, M30-45 Parameter-Audit | ADR 0003 „Declarative instance parameters are empty“; `src/core_contracts/declarative.py:702` (`EmptyParameters`) | A (Entscheidung) |
| G20 | **Event-Contract** (Rohereignis mit `since_at`, z. B. Bad-Ereignisse) statt Zustand — **unsicher**, ob mit `source_type = event` + Edge ausreichend abbildbar | M30-46 #7 | `src/core_contracts/registry.py:27`; `src/core_contracts/temporal.py:87` | A (unsicher) |

## 5. G4 — Designskizze Katalogpflege im Betrieb

**Anforderung (Akte):** persistenter, versionierter `map`-Katalog als Konfiguration eines Resolvers
(P4-38), Identität `(scope, media_type, signal_type, normalize_key(key))`, Master/Varianten eine Ebene,
Sichtungen mit `first_seen`/`last_seen`/`seen_count`, Klassifikation wird durch erneutes Sehen nie
überschrieben, kein Auto-Merge (M07-09/10); Versionen unveränderlich, Lebenszyklus, keine
Auto-Migration (M30-17); Pflege im Core-Rahmen (M30-27). Gleicher Bedarf für die LG-Source-Registry
(neue Sources automatisch `manual + active`, M30-34 §11).

| Variante | Kern | Vorteile | Nachteile |
|---|---|---|---|
| **V1 — Katalog in den Registry-Revisionen** | Kataloge bleiben `catalogs[]` im Registry-Dokument; jede Klassifikation = Draft → Validierung → Aktivierung | ein Mechanismus; Historie, OCC, Rollback und Fingerprint gratis | Runtime darf die Registry nie ändern (Spez. §10.3) → **Sichtungen und neue LG-Sources unmöglich**; jede Pflege ist eine Gesamtrevision mit Neuauswertung (M30-30); Grenzen 256 Einträge inline und 2 MB Dokument; jede Änderung verschiebt Fingerprints abhängiger Contracts |
| **V2 — eigene versionierte Katalog-Datenhaltung** | eigene Tabellen (Katalog, Eintrag, Inhaltsrevision); Registry referenziert `catalog_id` + Schema-Version; Runtime schreibt nur nicht-semantische Sichtungsdaten; semantische Änderungen nur per Admin-Aktion als neue Inhaltsrevision | skaliert; Sichtungen ohne Registry-Revision; Historie je Eintrag; passt zur Pflege-UI | zweiter Versionierungsmechanismus; neue Migration, Backup/Restore-Abdeckung; Fingerprint-Regel für Inhaltsrevisionen muss neu definiert werden |
| **V3 — Hybrid (Empfehlung zur Entscheidung)** | **Katalog-Definition** (Klassen-Enum, Identitätsregel, Vererbung, Lebenszyklus) als versionierte Registry-Definition; **Katalog-Inhalt** in eigener Datenhaltung mit append-only Inhaltsrevisionen; **Sichtungen** als Laufzeitdaten (Prüfwarteschlange in der UI); unklassifizierte Schlüssel ergeben `unmapped_value` | trennt Semantik (unveränderlich, M30-17) von Pflege (häufig); Sichtungen ändern keine Wahrheit; Fingerprint nur für die Definition, Inhaltsrevision als eigene Evidenz | höchster Entwurfsaufwand; Definition nötig, wann eine Inhaltsrevision eine Baseline invalidiert (A-06: nur betroffene Schlüssel?) |

**Offene Entscheidungsfragen zu G4:** (1) Wirkt eine Inhaltsrevision sofort (M30-30-Lauf) oder erst nach
bewusster Veröffentlichung? (2) Gilt ein neu gesehener, unklassifizierter Titel als `unknown/unmapped_value`
(dann sichtbares Problem nach M30-01) oder als reguläre Klasse „unklassifiziert“? (3) Übernahme des
Ist-Bestands aus dem Title-Classifier (Import als Draft, Spez. §23).

## 6. Größe der Art-A-Lücken und Abhängigkeiten

| # | Lücke | Größe | Hängt ab von |
|---|---|---|---|
| G18 | Phase-1-Scope-Sperren lösen | klein | – (zuerst) |
| G1 | Uhrzeit/Kalender als Eingang, Zeitpunkt-Erreicht-Auswertung | mittel | – |
| G3 | Text-Operatoren (geschlossene Liste) | klein–mittel | – |
| G5 | Versions-Lebenszyklus | klein–mittel | – |
| G6 | Formelkatalog typisiert mit `category` | klein–mittel | G5 |
| G13 | `bucket` n Klassen, Grenzen aus Eingängen | klein–mittel | G1 (für saisonale Grenzen) |
| G14 | Konfigurationsvollständigkeit als Achse | klein–mittel | – |
| G9 | Herkunftsart, Prognose-Gültigkeit | mittel | – |
| G8 | Stuck-/Plausibilitätserkennung je Sensorprofil | mittel | G9 (optional) |
| G10 | manuelle Source `origin = manual` | mittel | – |
| G12 | SM-Fristenmodell | mittel | G1 (absolute Zeit aus Eingang) |
| G15 | Provenienz HA-Kontext | klein | Bridge-Protokoll (gemeinsam mit G2/G7/G16) |
| G17 | HA-Ausfall-Semantik + HA-Lifecycle-Eingang | klein–mittel | **Entscheidung** |
| G19 | Instanzparameter deklarativ | mittel | **Entscheidung**; G18 |
| G7 | HA-Benachrichtigung | klein–mittel | Bridge-Service-Kanal; G14 (Inhalt) |
| G16 | Reconciliation-Refresh | mittel | Bridge-Service-Kanal; G12 oder Temporal für Wiederholungen |
| G2 | Kalender über Bridge + Cache | mittel–groß | G1; Bridge-Service-Kanal mit Antwort |
| G4 | Katalogpflege im Betrieb | groß | G3, G5, G14; Variantenentscheidung |
| G20 | Event-Contract | mittel (unsicher) | **Prüfung, ob nötig** |

**Gemeinsamer Unterbau:** G2, G7, G15 und G16 brauchen denselben neuen Bridge-Kanal für Service-Aufrufe
(mit Antwort, Allowlist, Protokollversion 2). Er sollte einmal entworfen werden.

**Reihenfolge-Vorschlag:** G18 → Entscheidungen G17/G19/G4 → G1 → G3, G5, G14 → G6, G13, G10, G12 →
Bridge-Service-Kanal → G2, G7, G15, G16 → G8, G9 → G4. G20 nur nach Prüfung.

## 7. Versionsschema für Mimir (AwesomeVersion-sicher)

**Nachweis:** lokal geprüft mit `awesomeversion==25.8.0` (gleicher Pin wie `dev/verify_postrelease.py`):

| Vergleich | erkannt als neuer? |
|---|---|
| `1.0.0a7.post1` → `1.0.0a8` | **nein** |
| `1.0.0b1.post1` → `1.0.0b2` | **nein** |
| `1.0.0a7.post1` → `1.0.0a8.dev0` | **nein** |
| `1.0.0a7` → `1.0.0a7.post1` | ja |
| `1.0.0a7.post1` → `1.1.0b1` / `1.0.0` / `1.0.1a1` | ja |
| `1.1.0b1` → `1.1.0b2` → … `1.1.0b10` → `1.1.0rc1` → `1.1.0` → `1.1.1` | ja (zweistellige Nummern korrekt) |
| `0.9.0` → `0.10.0` → `1.0.0` | ja |

**Regeln:**

1. **Nie `.postN` oder `.devN`** an Vor-Releases. Eine Korrektur ist immer die nächste Vor-Release-Nummer
   (`b3` statt `b2.post1`) oder nach dem Final ein Patch (`1.1.1`).
2. Phasen nur als PEP-440-Kürzel ohne Trenner: `aN` (Alpha), `bN` (Beta), `rcN`, Final ohne Suffix.
3. **Gleicher Supervisor-Slug wie Terra** (Update-Pfad ab `1.0.0a7.post1`): Beta als
   **`1.1.0b1, 1.1.0b2, …`**, dann `1.1.0rc1`, Final `1.1.0`. `1.0.0a8` ist ausgeschlossen.
4. **Neuer Slug** (Neuinstallation von Mimir): Beta als `1.0.0b1 …`, Final `1.0.0`; Regeln 1–2 gelten.
5. App, Python-Paket und Bridge-Manifest tragen dieselbe Version; API-, Bridge- und Konfigurations-
   protokoll bleiben getrennt nummeriert (Spez. §25).
6. Vor jedem Tag automatisch prüfen, dass die neue Version gegen **alle** bisherigen Tags mit dem
   gepinnten AwesomeVersion neuer ist (Erweiterung von `dev/verify_postrelease.py`).

**Offene Entscheidung:** gleicher Slug (Update aus Terra) oder neuer Slug (Neuinstallation) für Mimir.

## 8. Bewusst offen laut §30.14 (nicht als Lücke gewertet)

Parameter-Audit aller Zahlenwerte; Held-Akzeptanz je Temporal-Bedingung (A-05); technische Feld- und
Enum-Namen (Sleep-Herkunft, Presence-/Proximity-Felder); Reason-Taxonomie im Detail; Snapshot-/Revisions-
API F-23; F-17 Schlafnacht-Grenze; F-36 Modulstruktur Policy/Apply; Climate-Policy-Block inkl. Boost;
Source-Fusion LG/Denon (ruhend, PV-01); `user_interaction`-Contract (Hypothese); Multi-User; Vacation;
TV-Blendung (Messdaten); Lifecycle-Zustände des HA-Eintrags (Modellierung).

## 9. Grenzen dieser Prüfung

- Keine Tests ausgeführt; Aussagen zu „vorhanden“ beruhen auf Code- und Spezifikationslektüre.
- Die Abbildbarkeit von M30-39 (Arbitration) und G20 (Event-Contract) ist ohne Prototyp unsicher.
- Fachfunktionen wurden nur so weit im Ist-Code geprüft, wie es für die Art-A-Ableitung nötig war.
- Live-Verhalten ist nicht Gegenstand; Live bleibt Bennis Gate.
