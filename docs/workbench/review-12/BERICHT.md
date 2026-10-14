# UX- und Belastungstest Terra Workbench (12-Jahre-Perspektive)

Stand: 14.10.2026 · App „Core Contracts“ 1.0.0a5 (Slug `f18065c9_core_contracts`) über HA-Ingress ·
Branch `review/ux-12` (Basis `main` @ `34aecdb`) · Prüfer: Claude (nur Test, keine Produktänderung)

> **Abweichung von der Vorgabe:** Getestet wurde auf Bennis Wunsch mit **Chrome** (lokal, Claude-in-Chrome),
> nicht mit Firefox/Playwright. Der Viewport betrug effektiv **1568 × 710 CSS-Pixel** (Fenster 1920 × 1080
> mit Windows-Skalierung). Firefox-spezifische Prüfungen (Darstellung, Drag & Drop, Selects, Dialoge)
> sind deshalb **offen** (siehe Folgeaufgaben). Die HA-Seitenleiste wurde aus allen Screenshots
> herausgeschnitten; DB-Host/-Datenbank/-Rolle in A11 sind geschwärzt.

Grundlage: `docs/platform-alpha1/build-specification.md` (§§ 7, 8, 10, 13, 21, 26), ADR 0001–0003,
`docs/workbench/README.md`, `docs/api.md`, `docs/first-run.md` und die beschlossenen Vorgaben aus dem Auftrag
(Wörterbuch, Navigation, Farben, Entwurf-Prinzip, i18n).

Wörterbuch dieses Berichts: Vertrag = Contract/Instanz · Vorlage = Definition/Typ · Entwurf = Draft ·
Übernehmen = Aktivieren · Version = Revision · Zurücksetzen = Rollback · Konfiguration = Registry ·
Quelle = Source · Verknüpfung = Binding · Aktualität = Freshness · Nachweis = Evidence ·
Bereitschaft = Readiness · Zusammenführung = Fusion · Berechnung = Resolver · Ablauf = State Machine ·
HA-Anbindung = Bridge.

---

## 1. Kurzfazit

**Technisch trägt die Plattform erstaunlich gut**: Übernehmen, Zurücksetzen, erneut Übernehmen,
Versionskonflikte, Import/Export (verlustfrei), App-Neustart (≈ 3 s, sichtbar gemeldet) und alle
vier Aktualitäts-Modi funktionierten am Live-System mit echten HA-Entitäten. „Unbekannt“ sieht nie
wie „aus/falsch“ aus. Ungültige Entwürfe lassen sich nicht übernehmen.

**Für einen 12-Jährigen ist die Workbench heute nicht bedienbar.** Er scheitert spätestens an
Schritt 4 des ersten Vertrags:

1. Ein Wert aus HA braucht **vier Objekte mit vier Fach-IDs** (Abhängigkeit → Quelle → Verknüpfung →
   Vertrag) auf zwei Seiten und vier Reitern. Vom Vertrag aus gibt es keinen Weg „Quelle anlegen“
   (Sackgasse, B05).
2. **„Übernehmen“ fehlt in der Entwurfsleiste.** Es liegt nur in „Registry Studio → Bearbeiten →
   Aktivieren …“. Dort ist das Pflicht-Häkchen unsichtbar unter dem Rand des Dialogs; „Jetzt aktivieren“
   sieht aktiv aus und tut ohne Meldung nichts (B14/B15).
3. **Schwerster Fund:** Eine Zahl- oder Ja/Nein-Quelle liefert den HA-Text unverändert („20.6“, „off“).
   Jede eigene Vorlage steht deshalb nach dem Übernehmen auf *unbekannt · invalid_value*, obwohl
   „Prüfen“ vorher „gültig“ meldete. Erst eine versteckte „Typumwandlung“ an jeder Verknüpfung hilft.
   Deren Voreinstellung ist „number“, auch bei Ja/Nein-Quellen.
4. **Sprache:** etwa 1.090 fest eingebaute Texte in 51 Dateien, etwa 180 davon englisch oder Denglisch. Dazu
   kommen Rohcodes vom Server (`input_unknown`, `fresh`, `false`, `invalid configuration field`). Eine
   `de.json` gibt es nicht. Die Produktbezeichnung schwankt zwischen „Terra Workbench“ und „Core Contracts“.
5. **Der bekannte Befund „HA: disconnected“ ist bestätigt:** Ohne aktive HA-Quellen verbindet sich
   die App gar nicht, zeigt aber „disconnected“ und einen gelben Warnkasten. Das gilt auch dann, wenn die Bridge in
   HA geladen ist. Umgekehrt bleibt nach dem Zurücksetzen auf eine leere Konfiguration „connected“ stehen.

Die beschlossenen Vorgaben (Menü „Einstellungen“, Übersicht ohne Bereiche-Kacheln, Plakette mit
Zähler, Spalte „Zustand“, Vorlagen als eigene Seite, „Live ansehen / Bearbeiten“, Farbregeln, de.json)
sind **im Ist-Zustand alle noch nicht umgesetzt** (Abweichungsliste in Teil A).

Zeitbedarf für den ersten Vertrag mit Vorwissen: ~6 Minuten. Ohne Vorwissen: Abbruch bei der
Abhängigkeit (B06) oder spätestens beim versteckten Häkchen (B15).

---

## 2. Teil A – Rundgang pro Seite

Bewertungsschema je Seite: **Zweck in leichter Sprache** · **Doppelt** · **Begriffe (unklar / Denglisch)** ·
**Knöpfe** · **Zu viel? Vorschlag**.

### A.0 Rahmen (Kopfzeile, Seitenleiste)
- Zweck: Wo bin ich, ist alles in Ordnung, welcher Entwurf ist offen?
- Befunde:
  - Kopf „Terra Workbench / Core Contracts“; Assistent „Core Contracts einrichten“; HA-Seitenleiste
    „Core Contracts“ **zweimal** (App-Panel und Legacy-Panel). Vorgabe „Terra“ nicht umgesetzt.
  - Zwei widersprüchliche Status-Signale: Plakette **„Eingeschränkt“** (gelb) oben, darunter Karte
    **„bereit“** (grün) (A01). Vorgabe „Nicht bereit · 1“ mit Zähler und Link zur Lösung fehlt.
  - Rechts „Arbeits-Draft wählen“ bzw. Entwurfsleiste: Name · v · gespeichert · gültig · ↶ ↷ ·
    Speichern · Prüfen · ✕ — **kein „Übernehmen“**, kein „n Änderungen“, kein Umschalter
    „Live ansehen / Bearbeiten“ (Vorgabe).
  - „Prüfen“ gibt keine sichtbare Rückmeldung (nur die kleine Plakette ändert sich ggf.).
  - Klick auf „1 Fehler“ in der Leiste tut nichts (kein Sprung zur Fehlerliste).
  - Seitenleiste unten „Einrichtung prüfen“ doppelt zu „Administration → Einrichtungsassistent öffnen“.
  - „Layout anpassen“ auf jeder Seite (Panel-Verschieben) – für 12-Jährige ohne Nutzen, lenkt ab.

### A.1 Übersicht `#/` (A01, A12)
- Zweck (leicht): „Hier siehst du, ob alles läuft und welche Verträge Hilfe brauchen.“ – nur teilweise erfüllt.
- Doppelt: „Systemstatus & Readiness“ ist 1:1 auch in Administration; „Bereiche“-Kacheln doppeln die
  Seitenleiste (laut Vorgabe zu entfernen); Installationskarte (Version, Epoche, Publication, Revision)
  doppelt zu Administration.
- Begriffe: Readiness, Publication, Epoche, Persistenz, MQTT, „disconnected/connected/disabled“ (englische
  Rohwerte), Installations-UUID, Prüfsumme, „administrative“, „activate“, „draft_create“, „draft_delete“,
  „Rev. 0“.
- „Jüngste Ereignisse“: ungefilterte Audit-Rohcodes; nach dem Limit-Test 93× „draft_delete“ hintereinander.
- „Probleme“ (gut gedacht): zeigt `value` + `unbekannt` + Rohcode (`input_absent`, `restore_context_missing`).
  Keine Alltagssprache, kein „Was kann ich tun?“.
- Vorschlag: Schnellaktionen („Neuer Vertrag“, „Entwurf übernehmen“, „Konfiguration sichern“) +
  „Verträge mit Problemen“ in Alltagssprache + gefilterte Ereignisse. Technikdaten nach Einstellungen.

### A.2 Verträge `#/contracts` (A02, B34, C10)
- Zweck: „Liste aller Verträge – welcher Wert stimmt gerade, welcher nicht?“
- Doppelt: Spalten **Status · Gesundheit · Verfügbar · Offene Felder · Fehler** (5 Statusarten).
  Laut Vorgabe eine Spalte „Zustand“.
- **Es gibt keine Spalte „Wert“.** Der aktuelle Wert ist nur auf der Detailseite zu sehen.
- Begriffe: Instanzen, Contract, Typ `test.echo@1`, „aktiviert“ (meint *eingeschaltet*, nicht *übernommen*).
- Knöpfe: „Neue Instanz“ ohne offenen Entwurf ausgegraut, Grund nur als Tooltip. Hinweiskasten
  „schreibgeschützte Ansicht … Neuen Draft anlegen / Bestehenden Draft wählen“. Laut Vorgabe soll
  „Neuer Vertrag“ den Entwurf selbst starten, ohne Hinweiskästen.
- Lange IDs sprengen die Tabelle: Nur noch die Spalte „Contract“ ist sichtbar (C10).

### A.3 Vertrag – Detailseite `#/contracts/:id` (B04, B17, B35, C02, B36)
- Zweck: „Was ist der Wert jetzt, warum, woher?“ – Wert ja, Erklärung kaum.
- Positiv: Wert groß, „gültig/gesund“, Messzeit; *unbekannt* mit eigener gelber Plakette, nie „false“.
- Befunde: Feld heißt `value`; Wert „false“ statt „Nein/geschlossen“; **keine Einheit** (20.6 statt
  20,6 °C, Dezimalpunkt statt Komma); „Frische: fresh/invalid“; Gründe als Rohcode
  (`input_unknown`, `restore_context_missing`); „Publication 22“, „Revision 9“. Kein Verlauf. Keine
  Quellen mit HA-Namen (nur Reiter „Abhängigkeiten“). Befehle eines Ablaufs nicht hier, sondern nur in
  Diagnose → Commands.
- Plakette „aktiviert“ (grün) erscheint auch bei Verträgen, die nur im Entwurf existieren.
- Vorschlag: Kopf „Wert jetzt“ (mit Einheit, Ja/Nein, Farbe nach Vorgabe), „Warum?“ (ein Satz),
  „Woher?“ (HA-Entität mit Namen), „Verlauf“ (Mini-Diagramm), bei Ablauf: Knöpfe der Befehle.

### A.4 Vorlagen `#/definitions` (A03) und Vorlage – Detail (B22–B25, B31, B32)
- Zweck: „Bauanleitungen für Verträge.“
- Ist: nur Reiter auf der Verträge-Seite (Vorgabe: eigene Unterseite). Eingebaute („Paket-Typen“
  `test.echo`, `test.multi` …) und eigene sind getrennt (✓). „1 Felder“ (Grammatik).
- Editor-Reiter: Allgemein · Eingänge · Ausgaben · Benannte Regeln · State Machine · JSON (Experte).
  Begriffe: Sprachversion, „redaktionell“, Refresh-Eingänge, `available_projection`, Physischer Zustand,
  Guard, Episode, Session, Deadline, Fingerprint.
- Positiv: Regel-Operatoren übersetzt (Vergleich, UND, Konstante, Zuordnung …), Typfehler mit deutschem
  Text, Dialog „Neue Version … Instanzen gleich umstellen?“ gut verständlich (B39).
- Negativ: Zeitregeln englisch (`stable_for`, `dwell`, `grace`, `edge`, `delta`, `age`); jede Konstante
  zeigt volles Schema (Typ/Einheit/Pflichtwert/Physischer Zustand); „Neue Definition“ startet mit
  Eingang `a` (bool) und Ausgabe `value` (bool) → sofort Typfehler, wenn man den Eingang auf Zahl
  stellt; Typ-ID-Feld zeigt beim Öffnen schon einen roten Fehler (Vorbelegung „test.“, B21);
  Pflicht-Namensraum `test.*` ist für Nutzer unverständlich.

### A.5 Quellen `#/sources` (A04, B06–B10, B27, B33, B41)
- Zweck: „Woher kommen die Werte (welches Gerät in HA)?“
- Vier englische Reiter: Sources · Bindings · Kataloge · Dependencies. Reiterwechsel verliert Auswahl.
- Eine neue Quelle verlangt: Source-ID (`source.` Präfix), Typ (`state/attribute/event/numeric/text/boolean`),
  Herkunft „local“, **Physischer Schlüssel**, **Dependency (Pflicht, aber leer → roter Rohfehler
  „invalid source dependency/origin“)**, Frische-Modus (englisch), Zukunftstoleranz, optional
  „Eigenes Wertschema (value_schema)“.
- Verknüpfung: Binding-ID, Art (`ha_state/ha_attribute/mqtt/scheduler` – `scheduler` wird vom
  Server abgelehnt, steht aber zur Wahl), Fehler „schema.value_error invalid configuration field“ ohne
  Feldangabe, Transformation (Typumwandlung/Einheit skalieren/Katalog-Zuordnung).
- HA-Entitätsauswahl (B09): funktioniert, Suche gut, zeigt °C und Geräteklasse; startet aber mit
  `automation.*`, kein Bereichs-/Domänenfilter, kein aktueller Wert.
- Vorschlag: Ein Ablauf „Gerät aus Home Assistant hinzufügen“: Entität wählen → Quelle, Abhängigkeit,
  Verknüpfung und passende Typumwandlung werden automatisch angelegt; Fachfelder nur unter
  „Erweitert“.

### A.6 Konfiguration / Registry Studio `#/registry` (A05, B12, B18) und Entwurfsseite (B13, B29)
- Zweck: „Entwürfe verwalten, übernehmen und alte Versionen zurückholen.“
- Doppelt: zwei „Speichern“-Knöpfe (Leiste und Seite); Export pro Entwurf, pro Version und „Aktive
  Konfiguration exportieren“.
- Import ist versteckt: nur im Dialog „Neuer Draft“ als dritte Option „Import (JSON)“.
- Versionen-Liste ohne Namen/Herkunft (nur „Aktivierung“), „Zurückrollen“ auch für *neuere*
  Versionen (Wortsinn falsch). Prüfsummen-Hashes sichtbar.
- Diff zeigt bei **neuen** Objekten „Geänderte Fingerprints“ und gelbe Plaketten
  „Identitätswechsel Quellen/Bindings“ – wirkt bedrohlich, ist aber normal.
- Fehlerliste mit Sprung-Links (gut), aber Sprung landet nicht am Feld (B30).

### A.7 Graph `#/graph` (A06, A13)
- Zweck: „Bild, wer wem Daten gibt.“
- Knotenbeschriftung bei 1568 px kaum lesbar; zeigt bei offenem Entwurf dessen Inhalt (auch
  unfertige Verträge ohne Kanten) ohne deutliche Kennzeichnung „Entwurf“ vs. „live“.
- „Liveness & Dependencies“ (englisch), Knopf „Auswählen“ grau ohne Grund.

### A.8 Diagnose `#/diagnostics` – 6 Reiter (A07, A14, B37, B38, B40)
- Zweck: „Für Profis: warum ist ein Wert so?“
- Untertitel: „Werte, Quality, Reasons, Evidence, Explain, Temporal-/Restore-Zustand, Machine, Historie und
  Commands“.
- Reiter: Live-Zustand · Contract-Diagnose · Historie (10 Arten, „opaker Cursor“) · Publikationen & Lücken ·
  Evidence (Source-ID muss **getippt** werden, Ausgabe roher JSON-Dump) · Commands (einziger Ort für Befehle).
- „Resyncs 0×“ / „Neu synchronisiert 0×“ nach zwei App-Neustarts (B-11).
- Vorschlag: Befehle auf die Vertragsseite; Diagnose als „Experten-Ansicht“ unter Einstellungen;
  Evidence als Tabelle mit Auswahlfeld.

### A.9 Administration `#/admin` (A08)
- Zweck: „Einstellungen und Technik.“ Laut Vorgabe „Einstellungen“ mit Systemstatus, Installation,
  Verbindungen, Zugangsschlüssel, Protokoll – Inhalt passt, Name nicht.
- Widerspruch auf **einer** Seite: „Bridge-Zustand (Einrichtung): Bridge aktiv (Protokoll 1)“ und
  „Bridge: disconnected“ (vor der ersten HA-Quelle).
- „Token rotieren …“ in Rot – ok; Begriffe Consumer/Admin/Token englisch.

### A.10 Einrichtungsassistent (A09–A11)
- Zweck: „Erste Einrichtung Schritt für Schritt.“
- **Gefährlich**: In Schritt 1 ist „Verbindung ausdrücklich neu konfigurieren“ der hervorgehobene
  Hauptknopf; der sichere Weg „Datenbankschritte überspringen“ ist Nebenknopf.
- Schritt 4 hat **keinen „Weiter“**; der Weg zum Abschluss heißt „Ergebnisse ansehen“.
- Schritt 5 behauptet „Keine Registry wurde aktiviert“ – falsch (Revision 9 aktiv).
- Schrittleiste sieht aus wie Knöpfe, ist aber nicht klickbar.
- „Zur Administration (offene Einrichtung bleibt erhalten)“ erscheint auch, wenn die Einrichtung
  längst abgeschlossen ist.
- Schritt 2 zeigt nach „Zurück“ „Neue dedizierte Rolle und Datenbank“ vorgewählt und „Weiter“ als
  Hauptknopf, obwohl eine Datenbank existiert (Risiko eines versehentlichen Neu-Einrichtens).
- Schritt 2 zeigt den TLS-Modus „disable – unverschlüsselt“ ohne Warnung (die Warnung gibt es erst in Schritt 3).

### A.11 Abweichungen von den beschlossenen Vorgaben (Ist ≠ Soll)

| Vorgabe | Ist |
|---|---|
| Name „Terra“ überall | „Terra Workbench“ + „Core Contracts“ gemischt; Assistent „Core Contracts einrichten“ |
| Menü „Einstellungen“ | „Administration“ |
| Übersicht: Schnellaktionen, Probleme, gefilterte Ereignisse; keine Bereiche-Kacheln | Bereiche-Kacheln vorhanden, keine Schnellaktionen, Ereignisse ungefiltert und roh |
| Plakette „Nicht bereit · 1“ mit Klick zur Lösung | „Eingeschränkt“ ohne Zähler/Link, gleichzeitig Karte „bereit“ |
| Vertragstabelle: eine Spalte „Zustand“ | Status · Gesundheit · Verfügbar · Offene Felder · Fehler |
| Vorlagen eigene Unterseite | Reiter auf der Vertragsseite |
| „Neuer Vertrag“ startet Entwurf automatisch, keine Hinweiskästen | Knopf gesperrt, Hinweiskasten auf 5 Seiten |
| Umschalter „Live ansehen / Bearbeiten“ + „n Änderungen · Prüfen · Übernehmen“ | Leiste ohne Übernehmen, ohne Änderungszähler |
| Farben: Grau = unbekannt | unbekannt gelb (wie Warnung) |
| Texte in `frontend/src/i18n/de.json` | kein i18n, ~1.090 harte Strings |

---

## 3. Teil B – Ablauf-Protokoll

| # | Schritt | Ergebnis | Zögern / Raten / Aufgeben (12 J.) |
|---|---|---|---|
| B1.1 | Verträge → „Neuen Draft anlegen“ → Name „UX12 Bad-Temperatur“ | Entwurf v1, man bleibt auf der Seite ✓ | Dialog spricht von „fingerprint_version 2“ |
| B1.2 | „Neue Instanz“ → ID `bad.temperatur`, Typ `test.echo` v1 | angelegt | Muss eine Fach-ID erfinden („fixture.neu“), Typenliste nur `test.*` ohne Erklärung |
| B1.3 | Konfiguration → Eingang `a` | Auswahl **leer**, roter Rohfehler `contract_inputs config incomplete: inputs` | **Sackgasse**: kein „Quelle anlegen“ |
| B1.4 | Quellen → „+“ | `source.neu` mit Pflicht-Dependency, aber keine vorhanden → Rohfehler | **Aufgabe wahrscheinlich**: muss erst Reiter „Dependencies“ verstehen |
| B1.5 | Dependencies → „+“ `dep.ha` (ha/internal) → zurück zur Quelle, Dependency wählen | ok | Reiterwechsel verliert Auswahl |
| B1.6 | Bindings → „+“ → HA-Entität wählen `sensor.bath_climate_temperature` | ok, Picker gut | Fehler „schema.value_error invalid configuration field“ ohne Feld |
| B1.7 | Vertrag → Eingang `a` = Quelle | „gültig“ | Abschnitt „PARAMETER“ leer ohne Erklärung |
| B1.8 | „Prüfen“ in der Leiste | keine sichtbare Reaktion | „Hat das geklappt?“ |
| B1.9 | Übernehmen | nur über Registry Studio → Bearbeiten → „Aktivieren …“ | Muss den Ort kennen |
| B1.10 | Dialog „Registry aktivieren“ → „Jetzt aktivieren“ | **nichts passiert** | Häkchen „Ich habe die Auswirkungen geprüft …“ liegt unsichtbar unter dem Rand des Dialogs (B14/B15) |
| B1.11 | Häkchen + Übernehmen | „Revision 2 ist aktiv“ ✓ | – |
| B1.12 | Live-Wert | `value` 20.6, gültig, gesund, „Frische: fresh“ ✓ (B17) | keine Einheit, Punkt statt Komma |
| B1.13 | Zurücksetzen auf Revision 1 | neue Revision 3, Vertrag weg ✓ | wieder verstecktes Häkchen |
| B1.14 | Erneut übernehmen (Revision 2 → 4) | Wert 20.6 zurück, `since_at` erhalten ✓ | Knopf heißt „Zurückrollen“, obwohl es vorwärts geht |
| B2.1 | Eigene Vorlage **Berechnung** `test.bad_warm` (Temperatur > 20 °C) im Editor | ok nach Umbenennen/Typwechsel | Startvorlage erzeugt sofort Typfehler |
| B2.2 | Vertrag `bad.warm` mit eigener Vorlage | **Einheiten-Mismatch** `input_type_mismatch` (nennt nicht: „°C fehlt an der Quelle“) | **Aufgabe**: Lösung ist ein Schalter „Eigenes Wertschema (value_schema)“ an der Quelle |
| B2.3 | **Zusammenführung**, **alle 6 Zeitregeln**, **Ablauf mit Befehl** + vier Aktualitäts-Modi als komplette Konfiguration (Datei `testdaten/ux12-komplett.json`) über „Import (JSON)“ | Entwurf mit 4 Fehlern | siehe B2.4 |
| B2.4 | Fehler beheben über Sprung-Links | (a) `delta` liefert Zahl ohne Einheit → Ausgabefeld mit °C passt nicht; (b) **BUG**: Ablauf meldet `reinitialize_when` fehlt, der Editor zeigt aber „Konstante falsch“ als gesetzt → nur durch Hin- und Herschalten lösbar | Sprung landet auf falschem Feld (B30) |
| B2.5 | Übernehmen (Revision 5) | **alle eigenen Vorlagen unbekannt · invalid_value**, `bad.temperatur` zeigt Text „20.6“, `fenster.offen` Text „off“ | **Kernproblem**: Prüfung sagte „gültig“ |
| B2.6 | An allen 7 Verknüpfungen Transformation „Typumwandlung“ setzen (Voreinstellung „number“, auch bei Ja/Nein) → Revision 6 | alles gültig ✓: Zusammenführung 20,6 °C, `bad.warm` wahr, Zeitregeln gültig | Unauffindbar ohne Code-Lektüre |
| B2.7 | Ablauf `wohnzimmer.lueften` | bei Revision 5 gültig, seit Revision 6 **dauerhaft unbekannt · restore_context_missing** (Fingerprint durch Typumwandlung geändert, `reinitialize_when` = falsch) | Befehl `start` (bestaetigt = wahr) → „rejected · guard_rejected · Abgelehnt.“, obwohl Guard immer wahr; echte Ursache „kein Zustand“ wird nicht genannt |
| B3 | Neue Vorlagen-Version `test.bad_warm` v2 (Schwelle 21) mit Umzug von `bad.warm` (Dialog-Häkchen) → Revision 7 | `bad.warm` v2 → falsch (20,6 < 21) ✓; Diff „Mögliche Neuinitialisierung bad.warm“ | Dialog verständlich (bis auf „Fingerprint“) |
| B4 | Export aktive Konfiguration (`registry.json`, 13,6 KB, ohne Laufzeitdaten/Geheimnisse) → als neuen Entwurf importiert | gültig, **Diff leer** → verlustfrei ✓ | Dateiname ohne Datum/Version; Import nur im „Neuer Draft“-Dialog |
| B5 | Aktualität: `event_stateful` (Bad), `periodic_ttl` 900 s (Garten), `report_heartbeat` 3600 s (Thermostat), `liveness_source` (FRITZ!Box-CPU über Verbindungs-Sensor) | Server bewertet korrekt (fresh / invalid) | Modi nur als englische Rohwerte; Erklärsatz nur bei `event_stateful`; Liveness-Auswahl bietet auch Zahl-Quellen an; Vertrag zeigt nur „Frische: fresh/invalid“, abgeleitete Verträge gar nichts; Nachweis nur als JSON-Dump (B40) |

---

## 4. Teil C – Grenzfälle und provozierte Fehler

| Fall | erwartet | tatsächlich | Meldung verständlich | Schwere |
|---|---|---|---|---|
| Import kaputtes JSON | klare Meldung | „Kein gültiges JSON: Unexpected end of JSON input“ (Browser-Englisch) | teilweise | niedrig |
| Import leer | Knopf gesperrt | gesperrt ✓, aber alte Fehlermeldung bleibt stehen | teilweise | niedrig |
| Import Array statt Objekt | Ablehnung | „Eine Registry ist ein JSON-Objekt (kein Array, Skalar oder null).“ ✓ | ja | – |
| Import falsches Schema | Hinweis welche Felder | Entwurf wird angelegt; 7 × identisch „invalid configuration field“, nur Pfad unterscheidet sich (C01) | nein | mittel |
| Import mit `password`-Schlüssel | „Geheimnisse sind nicht erlaubt“ | „Die Anfrage ist ungültig.“ | nein | mittel |
| Import mit `profile` | Fehler | Entwurf mit 1 Fehler ✓ | ja | – |
| Zyklus Vertrag A ↔ B | Fehler mit Namen | „Die Contracts bilden einen Zyklus.“ Pfad `/contracts`, keine Namen, kein Feld markiert; Auswahl ließ Zyklus zu (C03) | teilweise | mittel |
| Ungültigen Entwurf übernehmen | gesperrt | „Aktivieren …“ gesperrt + „Der Draft enthält Fehler.“ ✓; API-Direktaufruf 400 ✓ | ja | – |
| Versionskonflikt beim Speichern (2 Tabs) | Konflikt, nichts geht verloren | Dialog „Versionskonflikt … Server v5, lokal v4. Nichts wurde überschrieben.“ mit 4 Wegen ✓ (C06) | ja (Wort „Server-Stand“ technisch) | – |
| … „als neuen Draft sichern“ | Kopie mit eigenem Namen | Kopie angelegt, aber Leiste bleibt „ungespeichert“; Namensfeld zeigt alten Namen; Speichern benennt Kopie in Original-Namen um → **zwei Entwürfe gleichen Namens** (C07) | nein | mittel |
| Versionskonflikt beim Übernehmen | Hinweis, kein Überschreiben | „Prüfergebnis veraltet – aktive Revision ist inzwischen 9 (geprüft gegen 8). Erneut prüfen“ ✓; oberer Kasten sagt weiter „aktuell Revision 8“ (C08) | ja | niedrig |
| Quelle löschen, die ein aktiver Vertrag nutzt | Warnung vor dem Löschen | Dialog warnt **nicht** (nur allgemein „Verweise … nicht automatisch angepasst“) (C04); danach 3 verständliche Prüffehler (C05); „Rückgängig“ stellt wieder her ✓ | teilweise | mittel |
| Verknüpfung auf nicht existierende Entität | Warnung beim Bearbeiten | gilt als „gültig“; nach Übernehmen „unbekannt · input_absent“ ✓ | nein (Rohcode, keine Vorwarnung) | mittel |
| Umbenannte Entität | wie oben | identisches Verhalten (Entität verschwindet) | nein | mittel |
| Typ-/Einheiten-Mismatch | sagt was nicht passt | `input_type_mismatch` „Typ, Katalog oder Einheit passen nicht“ (B26) | teilweise | hoch |
| Quellentyp numeric/boolean ohne Typumwandlung | wird als Zahl/Ja-Nein gelesen oder Prüfung warnt | Rohtext; alle Vorlagen `invalid_value`; Prüfung „gültig“ | nein | **kritisch** |
| HA-Entität `unavailable` | unbekannt, nie „aus“ | „unbekannt · eingeschränkt · Frische: invalid · input_unavailable“ ✓ | teilweise (Rohcodes) | niedrig |
| HA-Entität `unknown` | unbekannt, nie „aus“ | „unbekannt … input_unknown“ ✓ – gelb statt grau (C02) | teilweise | niedrig |
| App-Neustart während der Arbeit | Abbruch sichtbar, Erholung | Plakette „Verbindung unterbrochen“ + Banner „Gezeigt wird der letzte bekannte Stand“; nach ~3 s „Bereit“ ✓; Lücke `process_restart` protokolliert ✓; „Resyncs 0×“ (C12) | ja | niedrig |
| Bridge-Integration deaktivieren/aktivieren | Status, Erholung | **nicht getestet** – Berechtigungsprüfung hat die Integrationsänderung abgelehnt (offen) | – | offen |
| Browser-Zurück/Vorwärts mit ungespeicherten Änderungen | nichts geht verloren | Änderungen bleiben erhalten ✓ | – | – |
| Seite neu laden (gespeichert) | Entwurf wieder offen | wieder offen ✓; bei ungespeichert native „Seite verlassen?“-Warnung (Code), nicht live ausgelöst | ja | – |
| Sehr lange ID (305 Zeichen) | Ablehnung > Grenze | angenommen (Client + Server); Tabelle zeigt nur noch 1 Spalte, Fehlerliste läuft quer (C09, C10) | – | mittel |
| Umlaute in ID (`küche.wärme`) | erlaubt oder klar abgelehnt | „Anlegen“ gesperrt; Hinweis sagt „Buchstaben … erlaubt“ (ä ist für Nutzer ein Buchstabe) | nein | niedrig |
| Emoji / Leerzeichen / `a/b\c<script>` in ID | Ablehnung | gesperrt ✓ (gleicher Hinweis, nicht rot) | teilweise | niedrig |
| ID mit Punkt am Ende `ende.` | Ablehnung | angenommen | – | niedrig |
| Emoji/Umlaute im Anzeigenamen | erlaubt | ✓ | – | – |
| 100-Entwürfe-Limit | Knopf gesperrt / klare Meldung | Knopf aktiv bei „100 von 100“, Meldung „Die Anfrage ist ungültig.“ (C11) | nein | mittel |
| Zurücksetzen und erneut übernehmen | Werte/Zeitanker konsistent | ✓ (B1.13/14) | ja | – |
| Assistent: alle Schritte, Zurück, Abbrechen | sicher, verständlich | siehe A.10 (gefährlicher Hauptknopf, kein Weiter, falsche Aussage) | teilweise | hoch |

---

## 5. Bugs (getrennt von UX)

| ID | Befund | Ort / Ursache (Hinweis) | Schwere |
|---|---|---|---|
| BUG-01 | Statusanzeige HA/Bridge „disconnected“, obwohl die Bridge aktiv ist (keine HA-Quelle nötig ⇒ keine Verbindung ⇒ Initialwert bleibt stehen). Umgekehrt bleibt „connected“ stehen, nachdem auf eine Konfiguration ohne HA-Quellen zurückgesetzt wurde. Widerspruch zu „Bridge aktiv (Protokoll 1)“ im Assistenten/Admin. | `runtime.py` (Initialwerte `self.ha/self.bridge = "disconnected"`), `adapters/ha.py` `run()` (verbindet nur bei `requires_ha_snapshot`) | hoch |
| BUG-02 | Quellen vom Typ `numeric`/`boolean` liefern HA-Rohtext; deklarative Eingänge `number`/`bool` werden dadurch `invalid_value`. Validierung/Diff warnen nicht. Typumwandlung-Voreinstellung „number“ auch für Ja/Nein-Quellen. | Binding-Transform nur explizit (`adapters/ha.py` `type_cast`); Validierung prüft Typ nur statisch | kritisch |
| BUG-03 | Ablauf-Editor zeigt `reinitialize_when` mit Standard „Konstante falsch“ an, obwohl das Feld im Dokument fehlt → Server `schema.missing`, Formular wirkt korrekt. | `frontend/src/editors/MachineEditor.tsx` (`value.reinitialize_when ?? guardRule(false)`) | hoch |
| BUG-04 | Ablauf bleibt nach Fingerprint-Änderung dauerhaft `unknown/restore_context_missing`; Befehl liefert `guard_rejected` statt eines Grundes wie „Ablauf hat keinen Zustand“. Keine Bedienmöglichkeit zur Wiederherstellung. **Produktfrage** (Spezifikation §9.4: fehlender Kontext beweist keinen Erststart) | Restore-/Command-Pfad | hoch |
| BUG-05 | Pflicht-Häkchen in „Registry aktivieren“/„Zurückrollen“ liegt außerhalb des sichtbaren Bereichs. Der Bestätigungsknopf wirkt aktiv, ein Klick bleibt ohne Rückmeldung. | `features/registry/ActivationDialogs.tsx` | hoch |
| BUG-06 | Nach Konflikt-Option „als neuen Draft sichern“: Dirty-Status bleibt, Name/Titel veraltet, nächstes Speichern überschreibt den Namen der Kopie mit dem Originalnamen. | `features/authoring/WorkingDocument.tsx` / DraftPage | mittel |
| BUG-07 | Aktivierungsdialog nach Revisionswechsel nennt im Warnkasten weiter die alte aktive Revision. | `ActivationDialogs.tsx` | niedrig |
| BUG-08 | Assistent Schritt 5: „Keine Registry wurde aktiviert“ ist statischer Text, obwohl eine Revision aktiv ist. Außerdem fehlt in Schritt 4 ein „Weiter“ („Ergebnisse ansehen“). | `frontend/src/setup/SetupWizard.tsx` | mittel |
| BUG-09 | Vertrags-ID ohne Längengrenze (305 Zeichen angenommen) und mit Punkt am Ende akzeptiert. Lange IDs zerstören das Tabellen- und Fehlerlisten-Layout. | Registry-Validierung + `DataTable` | mittel |
| BUG-10 | Fehlermeldungen ohne Grund: Entwurf Nr. 101 und Import mit Geheimnis-Schlüssel → „Die Anfrage ist ungültig.“; der Knopf „Neuer Draft“ bei 100/100 ist nicht gesperrt. | API-Fehlerabbildung im Frontend | mittel |
| BUG-11 | „Resyncs 0×“/„Neu synchronisiert 0×“ nach Epochenwechsel durch App-Neustart. | `LiveStore` Zähler | niedrig |
| BUG-12 | Sprung-Links der Fehlerliste öffnen den Reiter, aber nicht das fehlerhafte Feld; Zyklus-Fehler ohne Objektnamen/Feldmarkierung; „1 Fehler“ in der Leiste nicht klickbar. | `IssueList`, Validierung `contract_cycle` | mittel |
| BUG-13 | App-Log: jede erwartbare Nutzer-Prüfung mit Fehlern wird als `ERROR processor_request_failed … RegistryValidationError operation=validate` protokolliert (auch `draft_create/draft_update ValueError`). | Logging-Level | niedrig |
| BUG-14 | Auswahllisten bieten Ungültiges an: Verknüpfungsart `scheduler` (Server lehnt ab), Liveness-Quelle auch Zahl-Quellen, Referenzliste `bad.temperatur.value · object`. | `RegistryObjects.tsx` | niedrig |
| BUG-15 | Anzeige-Artefakte: `0.6000000000000014` °C, `1492.97` (Sekunden ohne Einheit), Dezimalpunkt statt Komma. | Wertformatierung | niedrig |

**Hinweise (keine App-Bugs, aber zu beachten):** Die Supervisor-Optionen der App enthalten das
DB-Passwort und sind über die Supervisor-API für Admins lesbar. Live ist `postgres_sslmode: disable`
gesetzt, und der Assistent zeigt DB-Host und Rolle im Klartext. Die Werte stehen hier bewusst nicht.
HA-Protokoll (Filter „contract“): keine Fehler von `core_contracts_bridge`. Konsole: während der Rundgänge
keine JS-Fehler. Netzwerk: 147 API-Aufrufe, 142 × 200, 5 × 400 (alle aus provozierten Fällen).

---

## 6. Top-15 nach Wirkung

1. **Zahl-/Ja-Nein-Quellen automatisch richtig lesen** oder vor dem Übernehmen deutlich warnen (BUG-02).
2. **„Übernehmen“ in die Entwurfsleiste**; Bestätigungs-Häkchen immer sichtbar (BUG-05).
3. **Geführter Ablauf „Gerät aus Home Assistant hinzufügen“**: Abhängigkeit, Quelle, Verknüpfung und
   Typumwandlung werden automatisch angelegt; keine Sackgasse am Vertrags-Eingang.
4. **Status-Wahrheit HA/Bridge** (BUG-01); Kopfzeilen-Plakette „Nicht bereit · n“ mit Link zur Lösung.
5. **Sprache:** `de.json`, Wörterbuch umsetzen, Rohcodes (Gründe, Aktualität, Werte) in Alltagssprache
   übersetzen; Name „Terra“ einheitlich.
6. **Ablauf (State Machine) bedienbar machen:** Editor-Bug (BUG-03), Wiederherstellung/Startzustand
   (BUG-04, Produktentscheid), Befehle auf der Vertragsseite, verständliche Ablehnungsgründe.
7. **Vertragsliste mit „Wert“ und einer Spalte „Zustand“**; Detailseite mit Einheit, Ja/Nein, Warum, Woher, Verlauf.
8. **Fehlermeldungen, die sagen, was zu tun ist** (Einheit fehlt an Quelle X; Zyklus A → B → A;
   Geheimnis-Schlüssel; Limit 100; Feldname statt „invalid configuration field“).
9. **Assistent entschärfen:** sicherer Weg als Hauptknopf, „Weiter“ in jedem Schritt, korrekte
   Abschlussaussage, klickbare Schrittleiste.
10. **Navigation nach Vorgabe:** Einstellungen statt Administration, Vorlagen als eigene Seite,
    keine Hinweiskästen, Diagnose als Experten-Bereich.
11. **Farben nach Vorgabe:** unbekannt grau, Warnung gelb, Fehler rot; „aktiviert“ → „eingeschaltet“.
12. **Konflikt-Kopie korrekt benennen** (BUG-06) und aktuelle Revision in Dialogen (BUG-07).
13. **Grenzwerte:** ID-Länge begrenzen, Layout robust gegen lange Texte, Limit-Knopf sperren (BUG-09/10).
14. **Nachweis/Diagnose lesbar:** Quellen auswählen statt tippen, Tabelle statt JSON.
15. **Übersicht neu:** Schnellaktionen, Probleme in Alltagssprache, gefilterte Ereignisse (kein Audit-Rohstrom).

---

## 7. i18n-Bestand

- Werkzeug: TypeScript-AST-Scan (`frontend/src`, ohne Tests) – JSX-Text, sichtbare Attribute
  (`title`, `label`, `placeholder`, `aria-label` …) und Satz-Literale.
- **72 Dateien, davon 51 mit hartem Text, ≈ 1.090 Strings**, davon ≈ 180 englisch/Denglisch
  (Draft, Registry Studio, Binding, Source, Bridge, Readiness, Evidence, Fingerprint, Commands …).
- Größte Dateien: `editors/RegistryObjects.tsx` 93 · `setup/SetupWizard.tsx` 78 · `editors/RuleEditor.tsx` 74 ·
  `features/registry/DraftPage.tsx` 52 · `features/authoring/DraftBar.tsx` 47 ·
  `features/registry/ActivationDialogs.tsx` 46 · `features/admin/AdminPage.tsx` 45 ·
  `editors/DefinitionEditor.tsx` 42 · `features/registry/RegistryPage.tsx` 39.
- Zusätzlich übersetzungsbedürftig: Server-Rohwerte (Reason-Codes, `fresh/stale/invalid`, `connected`,
  Validierungscodes und `message`), Wertdarstellung (`true/false`, Einheit, Dezimalkomma).
- Aufwand (Schätzung): Infrastruktur + Schlüsselschema 0,5 PT; Auslagerung ≈ 1.090 Strings 3–4 PT;
  Code-/Wert-Übersetzungstabellen 1 PT; Glossar-Umstellung + Tests 1 PT → **≈ 6 PT**.

---

## 8. Was im Test angelegt wurde (Ausgangszustand vorher: Revision 1 leer, Entwurf „Licht“ von Benni)

- **Revisionen 2–9** (aktiv: **9**, Inhalt = Entwurf „UX12 Export-Reimport“ v5).
- **Entwürfe:** „UX12 Bad-Temperatur“, „UX12 Import falsches_schema“, „UX12 Import profil“,
  „UX12 Komplett“, 2 × „UX12 Export-Reimport“ (einer davon die Konflikt-Kopie, enthält `lang.xxx…` und
  `ende.`). 93 Limit-Entwürfe wurden angelegt und wieder gelöscht. Benni-Entwurf „Licht“ unangetastet.
- **In Revision 9:** Abhängigkeit `dep.ha`; 7 Quellen (`source.bad_temperatur`, `.garten_temperatur`,
  `.thermostat_temperatur`, `.fritz_verbindung`, `.fritz_cpu_unavailable`, `.portal_cpu_unknown`,
  `.fenster_links`); 7 Verknüpfungen auf echte HA-Entitäten (Garten zeigt seit Revision 8 auf die
  absichtlich falsche Entität `sensor.gibt_es_nicht_ux12`); Vorlagen `test.bad_warm` v1+v2,
  `test.temp_mix`, `test.fenster_zeit`, `test.fenster_ablauf`; 9 Verträge (`bad.temperatur`, `bad.warm`,
  `innen.temperatur`, `garten.temperatur`, `wohnzimmer.fenster_zeit`, `wohnzimmer.lueften`,
  `test.unavailable`, `test.unknown`, `fenster.offen`).
- Ein abgelehnter Befehl `start` an `wohnzimmer.lueften`; zwei App-Neustarts.
- **Nichts** an HA, Legacy `benni_core_contracts`, Bridge-Konfiguration oder PostgreSQL direkt geändert.
  Der App-Zustand bleibt so stehen; den Reset macht Benni.

---

## 9. Folgeaufgaben

1. **Reset der App-Datenbank** nach diesem Test (Benni).
2. **Slug-/Repo-Umbenennung** `core_contracts` / `core_contract_app` → Terra (eigenes Issue; nicht Teil dieser Arbeit).
3. **Bridge deaktivieren/aktivieren** nachtesten: Status, Meldungen, Erholung. In diesem Lauf wurde die
   Integrationsänderung von der Berechtigungsprüfung abgelehnt.
4. **Firefox-Test** nachholen (Darstellung, Selects, Dialoge, Drag & Drop „Layout anpassen“).
5. **Produktentscheidungen** (vor Umsetzung, Benni):
   - **(a)** ~~Sollen `numeric`/`boolean`-Quellen HA-Text automatisch umwandeln?~~ **Beschlossen
     14.10.2026:** Typ und Einheit sind ab dem ersten Übernehmen gesperrt, die Umwandlung folgt fest aus
     dem Typ und steht ausdrücklich in der Verknüpfung, ein Typwechsel heißt neue Quelle plus Umzug
     (Details: Issue #17, Codex-Paket B2).
   - **(b)** ~~Wie kommt ein Ablauf nach einer Fingerprint-Änderung wieder in einen Zustand?~~
     **Beschlossen 14.10.2026:** B3 (Erholung nur über echte Daten) + B4 (verständliche Diagnose) als
     Standard, B2 („Ablauf neu starten“ als Admin-Notausgang mit Freigabe am Ablauf, Bestätigung, Audit,
     Kennzeichnung „manuell“) – nach ADR. B1 abgelehnt (Details: Issue #17, Codex-Paket B4).
6. Barrierefreiheit (Tastatur, Kontrast „unbekannt“, Screenreader) messen.
7. Hinweis Betrieb: Live-DB läuft mit `sslmode: disable` – bewusst? (separat, kein UX-Thema).

---

## 10. Umsetzungsprompt für Codex

```text
Repo: Levtos/core_contract_app (main). Agent: Codex. Grundlage: docs/workbench/review-12/BERICHT.md
(Branch review/ux-12) und das GitHub-Issue „UX- und Belastungstest Terra Workbench (12-Jahre-Perspektive)“.
Vor Beginn: AGENTS.md, Levtos/control Bootstrap + ADR 0002, ADR 0001 (UX), build-specification §§7–10/13/21/26,
docs/workbench/README.md lesen. Je Arbeitspaket eigenes Issue/PR (genau ein agent:-Label), sauberer
Worktree vom verifizierten main. Kein Merge/Release/Live ohne Freigabe; Live bleibt Bennis Gate.
Keine Backend-Semantik ohne Produktentscheid ändern (markiert mit [ENTSCHEID]).
Keine Secrets/DB-Daten in Code, Tests, Logs, Screenshots.

Reihenfolge: B1 → B2 → B3 → B4 → B5 → B6 → U0 → U1 … U9. Bugs und UX-Umbau getrennte PRs.

=== BUGS ===
B1 Status-Wahrheit HA/Bridge (BUG-01)
- Runtime unterscheidet „nicht benötigt“ (keine aktive HA-Quelle) von „getrennt“/„verbunden“; Wert
  wird bei Wechsel auf „nicht benötigt“ zurückgesetzt (kein stehengebliebenes connected/disconnected).
- UI zeigt bei „nicht benötigt“ grau „Home Assistant: wird nicht gebraucht“ ohne Warnkasten.
- Akzeptanz: leere Registry + geladene Bridge → keine Warnung; Rollback auf Registry ohne HA-Quelle →
  kein „connected“. Tests: runtime/adapter-Unit + Frontend-Statuskarte.

B2 Typ-Sperre und Umwandlung (BUG-02) [ENTSCHEID (a) BESCHLOSSEN, Benni 14.10.2026 – Issue #17]
- Nutzer-Typen einer Quelle: Zahl, Ja/Nein, Text, Auswahl (technische Unterarten unter „Erweitert“).
- Bis zum ersten Übernehmen sind Typ, Einheit und Werteliste frei. Ab dem ersten Übernehmen sind Typ und
  Einheit gesperrt (Server-Validierung gegen die Historie aktiver Revisionen, nicht nur UI); die Werteliste
  darf nur ergänzt werden. Anzeigename/Beschreibung frei; HA-Gerät der Verknüpfung tauschbar, nur mit passendem Typ.
- Die Umwandlung folgt fest aus dem Typ (Zahl → type_cast number; Ja/Nein → type_cast bool on/off/true/false).
  Die Oberfläche schreibt sie beim Anlegen der Verknüpfung ausdrücklich in die Konfiguration (sichtbar in
  Export/Diff); keine implizite Laufzeit-Umwandlung.
- Die Validierung lehnt ab, wenn Quellentyp, Umwandlung und Vorlagen-Eingang nicht zusammenpassen, mit Text
  „Quelle X liefert …, Eingang Y erwartet …“ und Feldmarkierung. Ein Knopf „Umwandlung ergänzen“ für Altbestand.
- Typwechsel = neue Quelle + geführter Umzug (Dialog wie „Neue Version“ mit Häkchen je Vertrag); alte Quelle
  bleibt mit Historie, bis keine Referenz mehr besteht.
- Akzeptanz: (1) ux12-komplett.json über den geführten Weg angelegt → alle Verträge gültig ohne manuelle
  Transformation; (2) Typ/Einheit einer übernommenen Quelle ändern → Validierung rot, Server lehnt ab;
  (3) Werteliste ergänzen ok, entfernen/umbenennen abgelehnt; (4) Umzug stellt alle gewählten Verträge
  um, alte Historie bleibt lesbar. Tests: Validierung (Server) inkl. Sperre, Adapter-Unit type_cast,
  Frontend Binding-Anlage + Umzugsdialog, Engine-E2E.

B3 Ablauf-Editor reinitialize_when (BUG-03)
- Editor zeigt nie einen Wert, der nicht im Dokument steht; fehlendes Pflichtfeld wird als leer + Fehler
  am Feld angezeigt, oder beim Anlegen einer Maschine wird reinitialize_when explizit gesetzt.
- Akzeptanz: Import einer Maschine ohne reinitialize_when zeigt Fehler am Feld; ein Klick „Bedingung
  festlegen“ behebt ihn. Test: MachineEditor-Komponententest.

B4 Ablauf ohne gültigen Zustand (BUG-04) [ENTSCHEID (b) BESCHLOSSEN, Benni 14.10.2026 – Issue #17:
   B3 + B4 Standard, B2 Notausgang, B1 abgelehnt]
- B1 verboten: kein automatischer Reset ohne Datengrundlage; ohne Nachweis bleibt unknown.
- B3: Wiederherstellung nur über die deklarierte Neustart-Bedingung, ausgewertet auf gültiger Evidence.
  Validierung/Editor warnen deutlich bei konstanter Bedingung „falsch“ („kann sich nie selbst erholen“);
  der Editor schlägt eine Bedingung aus den Eingängen vor.
- B4: Diagnose und Vertragsseite erklären in Alltagssprache, warum der Ablauf unbekannt ist und welche
  Voraussetzung fehlt (z. B. „wartet auf: Fenster zu“). Befehle an einen zustandslosen Ablauf liefern einen
  eigenen Grund (z. B. state_unknown) statt guard_rejected.
- B2 [GATE: zuerst ADR 0004, da Spezifikation §6.7/§16 kein generisches set_state erlaubt]:
  Admin-Aktion „Ablauf neu starten“ nur, wenn die Ablauf-Definition sie erlaubt (neues Feld, Standard: aus).
  Bestätigungsdialog zeigt betroffene nachgelagerte Verträge (Impact) und den Hinweis „Startzustand wird
  manuell gesetzt, nicht durch Sensordaten bestätigt“. Wirkung: definierter Startzustand, neue Episode,
  origin=manual, Zeitpunkt, Grund, Akteur – persistiert in einem Commit (Command-/Audit-Pfad). Der Zustand
  trägt einen sichtbaren Grund (z. B. manual_restart), bis der erste datengetriebene Übergang oder eine
  erfüllte Neustart-Bedingung ihn bestätigt. Keine anderen Zielzustände, keine Wiederholung nach Restore.
- Akzeptanz: (1) Ablauf mit Bedingung „Fenster zu“ erholt sich nach einer Fingerprint-Änderung ohne
  Eingriff, sobald gültige Daten die Bedingung erfüllen; (2) ohne Nachweis bleibt unknown mit
  verständlicher Erklärung; (3) Befehl an einen zustandslosen Ablauf → state_unknown; (4) Neustart nur bei
  Freigabe, mit Bestätigung, Audit und manual-Kennzeichnung; ohne Freigabe ist der Knopf deaktiviert mit
  Grund; (5) Consumer sehen über Envelope/WS die Kennzeichnung. Tests: Restore-/SM-Unit, Command-Idempotenz,
  Audit, API, Frontend-Dialog, Engine-E2E.

B5 Dialoge, Konflikte, Assistent (BUG-05/06/07/08/11/12)
- Bestätigung in Aktivieren/Zurücksetzen immer sichtbar (sticky Footer), Knopf deaktiviert mit Grund.
- Konflikt-Kopie: Name „… (Kopie)“ bleibt erhalten, Dirty-Status korrekt, Titel aktualisiert.
- Aktivierungsdialog zeigt aktuelle aktive Revision.
- Assistent: „Weiter“ in Schritt 4; Abschlusstext aus Status (aktive Revision ja/nein); sicherer Weg
  als Hauptknopf in Schritt 1; Schrittleiste klickbar oder nicht wie Knöpfe gestaltet.
- Resync-Zähler zählt Epochenwechsel; Sprung-Links fokussieren das Feld; Zyklus nennt Objekte; „n Fehler“
  in der Leiste öffnet die Fehlerliste.
- Tests: Komponententests je Punkt; bestehende Wizard-Tests erweitern.

B6 Grenzwerte, Meldungen, Logs, Auswahllisten, Format (BUG-09/10/13/14/15)
- ID-Regeln einheitlich (max. Länge, kein Punkt am Ende), Hinweis rot und konkret; Layout mit
  Umbruch/Ellipsis + Tooltip.
- Klare Meldungen für Limit 100 (Knopf gesperrt) und verbotene Geheimnis-Schlüssel.
- Nutzer-Prüffehler als INFO/WARNING statt ERROR.
- Ungültige Optionen ausblenden (scheduler, Nicht-Bool-Liveness, `.value · object`).
- Zahlen gerundet, Dezimalkomma, Einheit, Dauer in s/min.
- Tests: Validierung (Server), Formatter-Unit, DataTable-Layout-Test.

=== UX-UMBAU ===
U0 i18n-Infrastruktur: frontend/src/i18n/de.json + t()-Helfer, Schlüssel je Bereich; Lint-Regel gegen
   harte JSX-Texte; Übersetzungstabellen für Reason-Codes, Aktualität, Status, Validierungscodes.
   Akzeptanz: 0 harte Strings laut Scan (Skript im Repo), EN-Datei vorbereitet, Umschaltung später.
U1 Wörterbuch + Name „Terra“ (siehe BERICHT Kopf); keine englischen Begriffe in der Oberfläche.
U2 Navigation: Übersicht · Verträge · Vorlagen · Quellen · Entwürfe & Versionen · Einstellungen
   (Systemstatus, Installation, Verbindungen, Zugangsschlüssel, Protokoll, Experten-Diagnose).
U3 Übersicht: Schnellaktionen, Verträge mit Problemen in Alltagssprache, gefilterte Ereignisse;
   Bereiche-Kacheln entfernen.
U4 Kopfzeilen-Plakette „Nicht bereit · n“ / „Bereit“ mit Klick → Details + Link zur Lösung.
U5 Verträge: Spalten Name · Wert · Zustand (ein Feld) · Quelle; Detailseite: Wert jetzt, Warum,
   Woher (HA-Name), Verlauf, Befehle des Ablaufs.
U6 Vorlagen als eigene Seite; eingebaute vs. eigene; Startvorlage typkonsistent; Zeitregeln deutsch.
U7 Entwurf-Prinzip: „Neuer Vertrag“ startet Entwurf automatisch; Umschalter „Live ansehen / Bearbeiten“;
   Leiste „n Änderungen · Prüfen · Übernehmen“ (mit sichtbarer Rückmeldung); Hinweiskästen entfernen.
U8 Geführt „Gerät aus Home Assistant hinzufügen“: Entität wählen → Quelle/Abhängigkeit/Verknüpfung/
   Typumwandlung automatisch; Fachfelder unter „Erweitert“; vom Vertrags-Eingang aus erreichbar.
   Akzeptanz: Usability-Szenario B1 (siehe Bericht) in ≤ 6 Klicks ohne Fach-ID-Eingabe.
U9 Farben: Petrol nur Marke/Navigation/Hauptknopf; Grün gesund, Gelb Warnung, Rot Fehler,
   Grau unbekannt/deaktiviert, Blau Info. Plakette „aktiviert“ → „eingeschaltet“.

Tests je UX-Paket: Vitest/RTL-Komponententests, bestehende E2E erweitert (Engine-E2E mit
testdaten/ux12-komplett.json), visuelle Prüfung in Chrome und Firefox 1920×1080. Kein Live-Deploy.
Abschluss je PR: Issue-Kommentar mit Ist/Soll, Tests, offene Punkte; Live-Gate bei Benni.
```

---

## Anhang: Screenshots und Testdaten

Alle Bilder in [`screens/`](screens/) (HA-Seitenleiste abgeschnitten). Präfix A = Rundgang, B = Ablauf, C = Grenzfälle.

- [A01-uebersicht](screens/A01-uebersicht.jpg)
- [A02-vertraege-leer](screens/A02-vertraege-leer.jpg)
- [A03-vorlagen-leer](screens/A03-vorlagen-leer.jpg)
- [A04-quellen-leer](screens/A04-quellen-leer.jpg)
- [A05-konfiguration](screens/A05-konfiguration.jpg)
- [A06-graph-leer](screens/A06-graph-leer.jpg)
- [A07-diagnose-leer](screens/A07-diagnose-leer.jpg)
- [A08-admin](screens/A08-admin.jpg)
- [A09-assistent-schritt1](screens/A09-assistent-schritt1.jpg)
- [A10-assistent-schritt4-kein-weiter](screens/A10-assistent-schritt4-kein-weiter.jpg)
- [A11-assistent-schritt2-geschwaerzt](screens/A11-assistent-schritt2-geschwaerzt.jpg)
- [A12-uebersicht-mit-daten](screens/A12-uebersicht-mit-daten.jpg)
- [A13-graph-mit-daten](screens/A13-graph-mit-daten.jpg)
- [A14-diagnose-vertrag](screens/A14-diagnose-vertrag.jpg)
- [B01-neuer-entwurf-dialog](screens/B01-neuer-entwurf-dialog.jpg)
- [B02-entwurf-offen-leiste](screens/B02-entwurf-offen-leiste.jpg)
- [B03-neue-instanz-dialog](screens/B03-neue-instanz-dialog.jpg)
- [B04-vertrag-detail-entwurf](screens/B04-vertrag-detail-entwurf.jpg)
- [B05-vertrag-konfig-sackgasse](screens/B05-vertrag-konfig-sackgasse.jpg)
- [B06-quelle-neu-dependency-fehler](screens/B06-quelle-neu-dependency-fehler.jpg)
- [B07-dependency-neu](screens/B07-dependency-neu.jpg)
- [B08-binding-neu](screens/B08-binding-neu.jpg)
- [B09-entity-picker](screens/B09-entity-picker.jpg)
- [B10-binding-fertig](screens/B10-binding-fertig.jpg)
- [B11-vertrag-eingang-gebunden](screens/B11-vertrag-eingang-gebunden.jpg)
- [B12-konfiguration-zwei-entwuerfe](screens/B12-konfiguration-zwei-entwuerfe.jpg)
- [B13-entwurf-seite-diff](screens/B13-entwurf-seite-diff.jpg)
- [B14-aktivieren-dialog-oben](screens/B14-aktivieren-dialog-oben.jpg)
- [B15-aktivieren-haekchen-versteckt](screens/B15-aktivieren-haekchen-versteckt.jpg)
- [B16-revision2-aktiv](screens/B16-revision2-aktiv.jpg)
- [B17-live-wert-20-6](screens/B17-live-wert-20-6.jpg)
- [B18-revisionen-liste](screens/B18-revisionen-liste.jpg)
- [B19-zuruecksetzen-dialog](screens/B19-zuruecksetzen-dialog.jpg)
- [B20-revision3-zurueckgesetzt](screens/B20-revision3-zurueckgesetzt.jpg)
- [B21-neue-vorlage-dialog-fehler-sofort](screens/B21-neue-vorlage-dialog-fehler-sofort.jpg)
- [B22-vorlage-allgemein](screens/B22-vorlage-allgemein.jpg)
- [B23-vorlage-eingaenge](screens/B23-vorlage-eingaenge.jpg)
- [B24-vorlage-ausgaben-typfehler](screens/B24-vorlage-ausgaben-typfehler.jpg)
- [B25-vorlage-regel-vergleich](screens/B25-vorlage-regel-vergleich.jpg)
- [B26-einheiten-mismatch](screens/B26-einheiten-mismatch.jpg)
- [B27-quelle-wertschema](screens/B27-quelle-wertschema.jpg)
- [B28-import-dialog](screens/B28-import-dialog.jpg)
- [B29-import-komplett-4-fehler](screens/B29-import-komplett-4-fehler.jpg)
- [B30-sprung-zu-fehler-falsches-feld](screens/B30-sprung-zu-fehler-falsches-feld.jpg)
- [B31-ablauf-editor](screens/B31-ablauf-editor.jpg)
- [B32-ablauf-neu-initialisieren](screens/B32-ablauf-neu-initialisieren.jpg)
- [B33-typumwandlung-default-number](screens/B33-typumwandlung-default-number.jpg)
- [B34-vertraege-liste-rev6](screens/B34-vertraege-liste-rev6.jpg)
- [B35-fenster-false](screens/B35-fenster-false.jpg)
- [B36-ablauf-unbekannt](screens/B36-ablauf-unbekannt.jpg)
- [B37-befehle](screens/B37-befehle.jpg)
- [B38-befehl-abgelehnt](screens/B38-befehl-abgelehnt.jpg)
- [B39-neue-version-umzug](screens/B39-neue-version-umzug.jpg)
- [B40-evidence-json](screens/B40-evidence-json.jpg)
- [B41-aktualitaet-liveness](screens/B41-aktualitaet-liveness.jpg)
- [C01-import-falsches-schema](screens/C01-import-falsches-schema.jpg)
- [C02-unknown-anzeige](screens/C02-unknown-anzeige.jpg)
- [C03-zyklus-kein-feldfehler](screens/C03-zyklus-kein-feldfehler.jpg)
- [C04-quelle-entfernen-dialog](screens/C04-quelle-entfernen-dialog.jpg)
- [C05-quelle-entfernt-pruefung](screens/C05-quelle-entfernt-pruefung.jpg)
- [C06-versionskonflikt-speichern](screens/C06-versionskonflikt-speichern.jpg)
- [C07-nach-konflikt-ungespeichert](screens/C07-nach-konflikt-ungespeichert.jpg)
- [C08-uebernehmen-veraltet](screens/C08-uebernehmen-veraltet.jpg)
- [C09-lange-id-fehlerliste](screens/C09-lange-id-fehlerliste.jpg)
- [C10-lange-id-tabelle](screens/C10-lange-id-tabelle.jpg)
- [C11-limit-101-entwurf](screens/C11-limit-101-entwurf.jpg)
- [C12-nach-app-neustart](screens/C12-nach-app-neustart.jpg)

Testdaten in [`testdaten/`](testdaten/): `ux12-komplett.json` (vollständige Testkonfiguration, Import B2.3), `kaputt.json`, `leer.json`, `falsches-schema.json`, `array-statt-objekt.json` (Import-Grenzfälle Teil C).
