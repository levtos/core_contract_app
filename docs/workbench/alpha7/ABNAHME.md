# Alpha 7 — vollständige Auftrags- und Nachweismatrix

Auftrag: [Issue #19](https://github.com/levtos/core_contract_app/issues/19),
Basis `4687c3556618de3c4b14a309c317bf41893986c4` / `v1.0.0a6`.
Bericht: [UX12](https://github.com/levtos/core_contract_app/blob/review/ux-12/docs/workbench/review-12/BERICHT.md),
Blob `116efaeebeae1fcb55fc6b29e77ca5c3b2c56c29`.
Zwischenstand, keine Abnahme. „offen“ wird vor PR-Abschluss durch „erledigt“ oder
„nicht umgesetzt“ mit ausdrücklichem Grund ersetzt. Keine stille Auslassung.

Screenshots müssen Firefox und Google Chrome bei **1920×1080** belegen, mit
Vorher/Nachher-Zuordnung pro Route. Neue Unterseiten haben vorher die zugehörige
Alpha-6-Sammelseite als Vergleich; diese Zuordnung wird ausdrücklich angegeben.
Nur synthetische lokale Testdaten, keine HA-/DB-Verbindung. `en.json` bleibt unverändert.

| Punkt | Anforderung | Status / Grund | Test | Screenshot |
|---|---|---|---|---|
| P1.01 | Zweistufige aufklappbare Module; eine Aufgabe je Hash-Unterseite | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.02 | Übersicht als eigene Route | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.03 | Meine Verträge, Vertrag/Detail, Vertrag importieren, Zusammenhänge | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.04 | Eigene und eingebaute Vorlagen | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.05 | Geräte aus HA, Verknüpfungen, Wertelisten, Abhängigkeiten | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.06 | Entwürfe, Versionen, Import/Export | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.07 | Systemstatus, Installation, Verbindungen, Schlüssel, Protokoll, Experten-Diagnose mit sechs Bereichen | umgesetzt; Sichtprüfung offen | navigation.test.tsx; admin.test.tsx | offen |
| P1.08 | Alte Links umleiten, Auswahl-/Fehlerparameter erhalten; intern direkte neue Links | umgesetzt; Sichtprüfung offen | navigation.test.tsx; roundtrip.test.ts; manualFirst.test.tsx | offen |
| P1.09 | Doppelten Einrichtung-prüfen-Eintrag entfernen | umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| P1.10 | Instanz/Instanzen durch Vertrag/Verträge ersetzen | umgesetzt; Sprachprüfung offen | scan:i18n; build-registry.test.tsx | offen |
| P1.11 | Layout anpassen im kleinen ⋯-Menü | umgesetzt; Sichtprüfung offen | PanelLayout.test.tsx | offen |
| P2.01 | Nicht bereit · n / grün Bereit; Version daneben | umgesetzt; Sichtprüfung offen | readiness.test.tsx | offen |
| P2.02 | Klick und Hover öffnen Bedingungen als Sätze mit Lösungslinks | umgesetzt; Sichtprüfung offen | readiness.test.tsx | offen |
| P2.03 | Keine gelben Warnkästen auf Seiten | zentrale Bedingungskästen entfernt; übrige Seitenprüfung offen | readiness.test.tsx | offen |
| P2.04 | Kopf-Umschalter Live ansehen / Bearbeiten | mit P5 umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| P3.01 | Nur drei Übersichtsblöcke, keine Status-/Installations-/Bereiche-Karten | umgesetzt; Sichtprüfung offen | overview.test.tsx | offen |
| P3.02 | Neuer Vertrag, Import, Übernehmen nur bei offenem Entwurf | umgesetzt; Sichtprüfung offen | overview.test.tsx; draftMode.test.tsx | offen |
| P3.03 | Zähler aktiv/gesund/eingeschränkt/ausgeschaltet filtern Vertragsliste | umgesetzt; Servergesundheit, unbekannt bis Snapshot | overview.test.tsx | offen |
| P3.04 | Probleme in Alltagssprache mit Was kann ich tun? | umgesetzt; Sichtprüfung offen | overview.test.tsx | offen |
| P3.05 | Relative menschliche Ereignisse: Übernehmen, Zurücksetzen, Vertrag veraltet/fehlerhaft, HA getrennt/verbunden | umgesetzt; HA-Wechsel ausdrücklich nur aktuelle Browsersitzung, da keine persistierte Verbindungshistorie vorhanden | overview.test.tsx; live.test.ts | offen |
| P3.06 | Entwurf anlegen/löschen nur Protokoll; Link Alle im Protokoll | umgesetzt; Sichtprüfung offen | overview.test.tsx; admin.test.tsx | offen |
| P4.01 | Liste Name/Wert/Zustand/HA-Quellenname; ein Zustandschip mit Hoverdetails | umgesetzt; Sichtprüfung offen | contracts.test.tsx | offen |
| P4.02 | Einheit, Dezimalkomma, Ja/Nein; lange IDs Ellipsis/Tooltip | umgesetzt; Sichtprüfung offen | contracts.test.tsx; status.test.ts | offen |
| P4.03 | Detail: großer Wert jetzt und Warum? als Satz | umgesetzt; Live-Werte verwenden ausschließlich die aktive Schemazuordnung | contracts.test.tsx | offen |
| P4.04 | Detail: Woher? mit HA-Namen und Mini-Verlauf | umgesetzt; maximal 60 gespeicherte Änderungen, unbekannte Werte bleiben Lücken | contracts.test.tsx | offen |
| P4.05 | Ablauf-Befehlsknöpfe auf Vertragsdetail | umgesetzt; deklarierte Befehle mit bestehender Serverprüfung/Bestätigung | contracts.test.tsx; diagnostics.test.tsx | offen |
| P4.06 | Prominenter JSON-/Textimport, automatisch Entwurf, Prüfergebnis vor Übernehmen | umgesetzt; Übernehmen prüft den exakten aktuellen Entwurf erneut | navigation.test.tsx; draftOwnership.test.tsx | offen |
| P4.07 | eingeschaltet statt aktiviert; reine Entwurfsverträge klar kennzeichnen | umgesetzt für Verträge; Sprachprüfung übriger Bereiche folgt | contracts.test.tsx; scan:i18n | offen |
| P5.01 | Live ansehen/Bearbeiten; alle Fachseiten im Bearbeiten-Modus editierbar | umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| P5.02 | Leiste n Änderungen / Prüfen / Übernehmen | umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| P5.03 | Sichtbare Prüfrückmeldung; n Fehler öffnet Liste | umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| P5.04 | Übernehmen öffnet Bestätigungsdialog | umgesetzt; exakter Kandidat nach asynchronem Speichern gesichert | draftMode.test.tsx; draftOwnership.test.tsx | offen |
| P5.05 | Anlegen/Import startet automatisch Entwurf, ohne Sprung auf andere Seite | umgesetzt für Verträge, Vorlagen/Versionen und alle Quellenarten; Sichtprüfung offen | draftMode.test.tsx; navigation.test.tsx; versioning.test.tsx | offen |
| P5.06 | Name optional mit Änderungen vom Datum Uhrzeit; erklärender Satz | umgesetzt; Sichtprüfung offen | draftMode.test.tsx; navigation.test.tsx | offen |
| P5.07 | Schreibschutz-Hinweiskästen entfernen; deaktivierte Knöpfe mit sichtbarem Grund | Kästen entfernt, Entwurfsaktionen begründet; weitere Seitenprüfung folgt | draftMode.test.tsx | offen |
| P6.01 | Geräteführung wählt HA-Entität mit Bereichs-/Domänenfilter und aktuellem Wert | umgesetzt; ausdrückliche Admin-Vorschau, getrennt von reinen Metadaten; Sichtprüfung offen | devices.test.tsx; test_alpha7_discovery.py | offen |
| P6.02 | Quelle/Abhängigkeit/Verknüpfung/ausdrückliche passende Typumwandlung automatisch | umgesetzt; UX12-Originalimport über Geräteführung, keine manuelle Transformation | devices.test.tsx; e2e.test.tsx | offen |
| P6.03 | Fach-IDs vorgeschlagen; Fachfelder nur Erweitert | umgesetzt; Namen/Kennungen automatisch, technischer manueller Weg bleibt zugänglich | devices.test.tsx; manualFirst.test.tsx | offen |
| P6.04 | Auch am Vertrags-Eingang erreichbar | umgesetzt; typ-/einheitenpassende Geräteauswahl im Eingangs-Editor | ContractDetailPage; devices.test.tsx | offen |
| P6.05 | Erster Temperaturvertrag in höchstens sechs Klicks ohne Fach-ID | umgesetzt; sechs Klicks bis bestätigter Übernahme im Interaktionstest | devices.test.tsx | offen |
| P6.06 | Aktualitätsvorlagen Temperatur/Kontakt/Bewegung/Zähler mit Modus und Frist, änderbar | umgesetzt; Kontakt ohne Altersfrist, übrige mit änderbarer Frist | devices.test.tsx; build-registry.test.tsx | offen |
| P6.07 | Modi deutsch, Ein-Satz-Erklärung; Kontakt: Alter allein kein Mangel, Lebenszeichen | umgesetzt; Sichtprüfung offen | devices.test.tsx; scan:i18n | offen |
| P6.08 | Quellen-Unterseiten erhalten jeweilige Auswahl beim Wechsel | umgesetzt; Kennung je Installation/Entwurf/Sammlung, Umbenennung ohne Editorverlust | devices.test.tsx; manualFirst.test.tsx | offen |
| P7.01 | Getrennte eigene/eingebaute Vorlagen; korrekte Mehrzahl | Seiten getrennt; Mehrzahl offen | navigation.test.tsx | offen |
| P7.02 | Neue Vorlage typkonsistent, Typ-ID ohne Sofortfehler, Präfix automatisch | offen | offen | offen |
| P7.03 | Alle sechs Zeitregeln deutsch plus Ein-Satz-Erklärung | offen | offen | offen |
| P7.04 | Konstanten zeigen Wert, Schema unter Erweitert | offen | offen | offen |
| P8.01 | Dialog neue Quelle mit anderem Typ/Einheit, Häkchen je umzustellendem Vertrag | offen | offen | offen |
| P8.02 | Alte Quelle und Geschichte bleiben erhalten; Referenzen bewusst umstellen | offen | offen | offen |
| P8.03 | Alltagstext für immutable_source_type mit Umzugsknopf | offen | offen | offen |
| P8.04 | Server-Validierung, Dialogtest und Engine-E2E | offen | offen | offen |
| P9.01 | ADR 0004 angenommen nach Bennis Auftrag, kein generisches set_state | offen | offen | offen |
| P9.02 | Freigabe pro Ablauf, Standard aus, unveränderliche Definition; ohne Freigabe sichtbarer Grund | offen | offen | offen |
| P9.03 | Nur serverseitig autorisierter Administrator, ausschließlich definierter Startzustand | offen | offen | offen |
| P9.04 | Bestätigung und direkter/transitiver Impact, Hinweis auf unbekannte externe Automationen | offen | offen | offen |
| P9.05 | Neue Episode, origin=manual, Zeitpunkt/Grund/Akteur und Audit atomar | offen | offen | offen |
| P9.06 | ID, Ablaufzeit, OCC, Idempotenz, Commitfehler, kein Replay nach Restore | offen | offen | offen |
| P9.07 | Kennzeichnung in Envelope/WS/Diagnose bis datengetriebener Bestätigung | offen | offen | offen |
| P9.08 | API-, Engine-, Autorisierungs-, Audit-, Restore- und Frontend-Nachweise | offen | offen | offen |
| P10.01 | Ein Speichern statt zwei | offen | offen | offen |
| P10.02 | Versionen mit Zeit, Wer und optionaler Notiz | offen | offen | offen |
| P10.03 | Zurücksetzen nur auf ältere Versionen | offen | offen | offen |
| P10.04 | Neue Objekte im Diff ohne bedrohliche Warnplaketten; Prüfsummen Erweitert | offen | offen | offen |
| P10.05 | Eigene Import-/Export-Unterseite | begonnen in P1 | navigation.test.tsx | offen |
| P11.01 | Graph bei 1920 lesbar, Entwurf/live markiert | offen | offen | offen |
| P11.02 | Kein grauer Knopf ohne Grund | offen | offen | offen |
| P11.03 | Nachweis mit Quellenauswahl und Tabelle statt Tippfeld/JSON | offen | offen | offen |
| P12.01 | Gedämpftes Petrol nur Marke/Navigation/Hauptknopf | offen | offen | offen |
| P12.02 | Exklusive Statusfarben Grün/Gelb/Rot/Grau/Blau, keine Dekoration | offen | offen | offen |
| P12.03 | Gesund-Grün unterscheidbar; WCAG AA für alle Status-Chips, besonders Grau | offen | offen | offen |
| P13.01 | Historische Alpha-6-Veröffentlichung korrekt dokumentieren | offen | offen | entfällt: Dokumentation |
| P13.02 | Workbench-README und CHANGELOG neue Struktur | offen | offen | entfällt: Dokumentation |
| P13.03 | Release-Notiz 1.0.0a7 | offen | offen | entfällt: Dokumentation |
| P13.04 | Versionen App/Python/Frontend 1.0.0a7 vorbereiten | offen | offen | offen |
| T.01 | Vitest/RTL je Paket und bestehende Regressionen | läuft paketweise | offen | entfällt: Testlauf |
| T.02 | Engine-E2E mit originaler UX12-Datei über Geräteführung ohne manuelle Transformation | offen | offen | offen |
| T.03 | i18n-Scan 0, en.json unverändert | laufend | scan:i18n | entfällt: Testlauf |
| T.04 | Firefox und Chrome 1920×1080, jede Seite/Unterseite vorher/nachher, PR-Anhang | offen | offen | offen |
| T.05 | Vollständige CI auf PR-Head grün; danach Stopp vor Merge/Release | offen | offen | entfällt: CI |
| A11.01 | Terra überall | Alpha 6 vorhanden; Regression offen | offen | offen |
| A11.02 | Einstellungen statt Administration | P1 umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| A11.03 | Übersicht mit Aktionen/Problemen/gefilterten Ereignissen, ohne Bereiche | offen | offen | offen |
| A11.04 | Nicht bereit · n mit Lösungslink | P2 umgesetzt; Sichtprüfung offen | readiness.test.tsx | offen |
| A11.05 | Vertragstabelle eine Spalte Zustand | offen | offen | offen |
| A11.06 | Vorlagen eigene Unterseite | P1 umgesetzt; Sichtprüfung offen | navigation.test.tsx | offen |
| A11.07 | Neuer Vertrag startet Entwurf, keine Hinweiskästen | P5 umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| A11.08 | Live/Bearbeiten und n Änderungen/Prüfen/Übernehmen | P5 umgesetzt; Sichtprüfung offen | draftMode.test.tsx | offen |
| A11.09 | Grau = unbekannt | offen | offen | offen |
| A11.10 | Texte in de.json | Alpha 6 vorhanden; Regression laufend | scan:i18n | offen |
| TOP.01 | Zahl-/Ja-Nein-Quellen richtig lesen oder warnen | Alpha 6 vorhanden; Geräteführung offen | offen | offen |
| TOP.02 | Übernehmen in Leiste, Bestätigung sichtbar | Bestätigung in Alpha 6; Leiste offen | offen | offen |
| TOP.03 | Geführtes HA-Gerät ohne Sackgasse | offen | offen | offen |
| TOP.04 | HA/Bridge-Status wahr; Bereitschaftsplakette mit Lösung | Runtime Alpha 6; Kopfzeile offen | offen | offen |
| TOP.05 | Wörterbuch, keine Rohcodes, Terra | Alpha 6 vorhanden; weiterer Sprachdurchgang offen | offen | offen |
| TOP.06 | Ablaufeditor, Wiederherstellung, Neustart, Befehle auf Vertrag | Alpha-6-Basis vorhanden; P4/P9 offen | offen | offen |
| TOP.07 | Vertragsliste Wert/Zustand, Detail Einheit/Ja-Nein/Warum/Woher/Verlauf | offen | offen | offen |
| TOP.08 | Handlungsorientierte Fehlermeldungen inkl. Einheit/Zyklus/Geheimnis/Limit/Feld | Alpha 6 vorhanden; Regression offen | offen | offen |
| TOP.09 | Sicherer Assistent, Weiter, Abschluss, Schrittleiste | Alpha 6 vorhanden; Regression/Sichtprüfung offen | offen | offen |
| TOP.10 | Neue Navigation, Vorlagen, keine Hinweiskästen, Experten-Diagnose | P1 begonnen, P5 offen | navigation.test.tsx | offen |
| TOP.11 | Statusfarben und eingeschaltet | offen | offen | offen |
| TOP.12 | Konflikt-Kopie und aktuelle Version | Alpha 6 vorhanden; Regression offen | draftSafety.test.tsx; versioning.test.tsx | offen |
| TOP.13 | ID-Grenzen, lange Texte, Entwurfslimit | Alpha 6 vorhanden; Regression offen | offen | offen |
| TOP.14 | Nachweis als Tabelle mit Auswahl | offen | offen | offen |
| TOP.15 | Neue Übersicht, kein roher Ereignisstrom | offen | offen | offen |

## Paketnachweise

- P1: 16 neue Navigationstests; bestehende Tests für Layout, Tokens, Entwurfsschutz,
  Vorlagenversionen und manuelles Erstellen an die neuen Wege angepasst. TypeScript,
  Produktionsbuild und Sprachscan grün. Vollständiger Frontend-Regressionstest:
  **183 bestanden**, drei Engine-E2E laufen separat. Alte Vertrags-IDs kollidieren
  nicht mit neuen Unterseiten; Prüfung und Fehlerlinks behalten ihre JSON-Pointer.
  Browserbilder und finale CI folgen mit dem vollständigen Umbau.
- P2: vier neue Tests für Zähler, deutsche Lösungslinks, Hover/Klick, Escape,
  Außenklick und fehlende erfundene HA-Störung während des Verbindungsaufbaus.
  Zusammen mit Navigation/Status 27 Tests grün; TypeScript und Sprachscan grün.
  Der Umschalter folgt in P5 gemeinsam mit der Entwurfszustandsführung.
- P5: sieben neue GUI-Tests und drei Besitz-/Parallelitätstests. Automatischer Entwurf,
  Ansichtswechsel ohne Verlust, Fehlerdialog ohne Navigation und Übernahmevorbereitung
  mit exakt gespeichertem Kandidaten. Zwei gleichzeitige Anfragen erzeugen einen Entwurf;
  späte Antworten nach Bearbeiten/Entwurfswechsel werden abgewiesen. Gesamtlauf:
  **197 Frontend-Tests bestanden**, drei Engine-E2E separat; Build, TypeScript und Sprachprüfungen grün.

## Freigabegrenze

Ein Issue, ein Branch, ein PR. Kein Merge, Tag, Release, Image-Publish, Installation,
DB-Reset oder Live-Eingriff. Legacy/HA/Einhornzentrale und englisches Wörterbuch
bleiben unverändert. Unabhängiger UX-Nachtest und Bennis Live-Gate folgen später.
