# Alpha 7 — vollständige Auftrags- und Nachweismatrix

Auftrag: [Issue #19](https://github.com/levtos/core_contract_app/issues/19), ein Branch und ein PR.
Basis `main@4687c3556618de3c4b14a309c317bf41893986c4` / `v1.0.0a6`.
Verbindlicher [UX12-Bericht](https://github.com/levtos/core_contract_app/blob/review/ux-12/docs/workbench/review-12/BERICHT.md),
Blob `116efaeebeae1fcb55fc6b29e77ca5c3b2c56c29`.

„erledigt“ bezeichnet die technische Umsetzung und den angegebenen Nachweis, keine Live-Abnahme.
Einschränkungen stehen ausdrücklich in der jeweiligen Zeile und unten. Die Bildverweise öffnen
die Vorher-/Nachher-Originale für beide Browser einschließlich der tatsächlichen alten/neuen Route.
Neue Dialoge besitzen naturgemäß nur Nachher-Bilder. [Browserverfahren und 162 Bilder](BROWSER.md).

| Punkt | Anforderung | Status / Grund | Test | Screenshot |
|---|---|---|---|---|
| P1.01 | Zweistufige aufklappbare Module; eine Aufgabe je Hash-Unterseite | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P1.02 | Übersicht als eigene Route | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P1.03 | Meine Verträge, Vertrag/Detail, Vertrag importieren, Zusammenhänge | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P1.04 | Eigene und eingebaute Vorlagen | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#templates-own) |
| P1.05 | Geräte aus HA, Verknüpfungen, Wertelisten, Abhängigkeiten | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#sources-devices) |
| P1.06 | Entwürfe, Versionen, Import/Export | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#changes-drafts) |
| P1.07 | Systemstatus, Installation, Verbindungen, Schlüssel, Protokoll, Experten-Diagnose mit sechs Bereichen | erledigt | navigation.test.tsx; admin.test.tsx | [Chrome/Firefox](BROWSER.md#settings-system) |
| P1.08 | Alte Links umleiten, Auswahl-/Fehlerparameter erhalten; intern direkte neue Links | erledigt | navigation.test.tsx; roundtrip.test.ts; manualFirst.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P1.09 | Doppelten Einrichtung-prüfen-Eintrag entfernen | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P1.10 | Instanz/Instanzen durch Vertrag/Verträge ersetzen | erledigt | scan:i18n; build-registry.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P1.11 | Layout anpassen im kleinen ⋯-Menü | erledigt | PanelLayout.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P2.01 | Nicht bereit · n / grün Bereit; Version daneben | erledigt | readiness.test.tsx | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| P2.02 | Klick und Hover öffnen Bedingungen als Sätze mit Lösungslinks | erledigt | readiness.test.tsx | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| P2.03 | Keine gelben Warnkästen auf Seiten | erledigt | readiness.test.tsx | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| P2.04 | Kopf-Umschalter Live ansehen / Bearbeiten | erledigt | draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| P3.01 | Nur drei Übersichtsblöcke, keine Status-/Installations-/Bereiche-Karten | erledigt | overview.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P3.02 | Neuer Vertrag, Import, Übernehmen nur bei offenem Entwurf | erledigt | overview.test.tsx; draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P3.03 | Zähler aktiv/gesund/eingeschränkt/ausgeschaltet filtern Vertragsliste | erledigt; unbekannter Zustand bleibt bis zum vollständigen Stand unbekannt | overview.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P3.04 | Probleme in Alltagssprache mit Was kann ich tun? | erledigt | overview.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P3.05 | Relative menschliche Ereignisse: Übernehmen, Zurücksetzen, Vertrag veraltet/fehlerhaft, HA getrennt/verbunden | erledigt für die aktuelle Browsersitzung; sitzungsübergreifende HA-Verbindungshistorie nicht umgesetzt, da die vorhandene API sie nicht persistiert und keine weitere Backend-Semantik beauftragt ist | overview.test.tsx; live.test.ts | [Chrome/Firefox](BROWSER.md#overview) |
| P3.06 | Entwurf anlegen/löschen nur Protokoll; Link Alle im Protokoll | erledigt | overview.test.tsx; admin.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| P4.01 | Liste Name/Wert/Zustand/HA-Quellenname; ein Zustandschip mit Hoverdetails | erledigt | contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P4.02 | Einheit, Dezimalkomma, Ja/Nein; lange IDs Ellipsis/Tooltip | erledigt | contracts.test.tsx; status.test.ts | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P4.03 | Detail: großer Wert jetzt und Warum? als Satz | erledigt; Live-Werte und Einheiten verwenden ausschließlich das aktive Schema | contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contract-detail) |
| P4.04 | Detail: Woher? mit HA-Namen und Mini-Verlauf | erledigt; bis zu 60 gespeicherte Änderungen der aktiven Version, unbekannte Werte bleiben Lücken | contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contract-detail) |
| P4.05 | Ablauf-Befehlsknöpfe auf Vertragsdetail | erledigt | contracts.test.tsx; diagnostics.test.tsx | [Chrome/Firefox](BROWSER.md#diagnostics-commands) |
| P4.06 | Prominenter JSON-/Textimport, automatisch Entwurf, Prüfergebnis vor Übernehmen | erledigt | navigation.test.tsx; draftOwnership.test.tsx | [Chrome/Firefox](BROWSER.md#contract-import) |
| P4.07 | eingeschaltet statt aktiviert; reine Entwurfsverträge klar kennzeichnen | erledigt | contracts.test.tsx; scan:i18n | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P5.01 | Live ansehen/Bearbeiten; alle Fachseiten im Bearbeiten-Modus editierbar | erledigt | draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P5.02 | Leiste n Änderungen / Prüfen / Übernehmen | erledigt | draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P5.03 | Sichtbare Prüfrückmeldung; n Fehler öffnet Liste | erledigt | draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P5.04 | Übernehmen öffnet Bestätigungsdialog | erledigt | draftMode.test.tsx; draftOwnership.test.tsx | [Chrome/Firefox](BROWSER.md#takeover-confirmation) |
| P5.05 | Anlegen/Import startet automatisch Entwurf, ohne Sprung auf andere Seite | erledigt | draftMode.test.tsx; navigation.test.tsx; versioning.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P5.06 | Name optional mit Änderungen vom Datum Uhrzeit; erklärender Satz | erledigt | draftMode.test.tsx; navigation.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P5.07 | Schreibschutz-Hinweiskästen entfernen; deaktivierte Knöpfe mit sichtbarem Grund | erledigt | draftMode.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| P6.01 | Geräteführung wählt HA-Entität mit Bereichs-/Domänenfilter und aktuellem Wert | erledigt | devices.test.tsx; test_alpha7_discovery.py | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.02 | Quelle/Abhängigkeit/Verknüpfung/ausdrückliche passende Typumwandlung automatisch | erledigt; unveränderte UX12-Datei, Typumwandlung über Geräteführung | devices.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.03 | Fach-IDs vorgeschlagen; Fachfelder nur Erweitert | erledigt | devices.test.tsx; manualFirst.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.04 | Auch am Vertrags-Eingang erreichbar | erledigt | ContractDetailPage; devices.test.tsx | [Chrome/Firefox](BROWSER.md#contract-config) |
| P6.05 | Erster Temperaturvertrag in höchstens sechs Klicks ohne Fach-ID | erledigt; sechs Klicks einschließlich Bestätigung in RTL, Chrome und Firefox | devices.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.06 | Aktualitätsvorlagen Temperatur/Kontakt/Bewegung/Zähler mit Modus und Frist, änderbar | erledigt | devices.test.tsx; build-registry.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.07 | Modi deutsch, Ein-Satz-Erklärung; Kontakt: Alter allein kein Mangel, Lebenszeichen | erledigt | devices.test.tsx; scan:i18n | [Chrome/Firefox](BROWSER.md#device-guide) |
| P6.08 | Quellen-Unterseiten erhalten jeweilige Auswahl beim Wechsel | erledigt | devices.test.tsx; manualFirst.test.tsx | [Chrome/Firefox](BROWSER.md#sources-bindings) |
| P7.01 | Getrennte eigene/eingebaute Vorlagen; korrekte Mehrzahl | erledigt | navigation.test.tsx; templates.test.tsx | [Chrome/Firefox](BROWSER.md#templates-built-in) |
| P7.02 | Neue Vorlage typkonsistent, Typ-ID ohne Sofortfehler, Präfix automatisch | erledigt | templates.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#template-detail) |
| P7.03 | Alle sechs Zeitregeln deutsch plus Ein-Satz-Erklärung | erledigt | templates.test.tsx, sechs Zeitregelfälle | [Chrome/Firefox](BROWSER.md#template-rules) |
| P7.04 | Konstanten zeigen Wert, Schema unter Erweitert | erledigt | templates.test.tsx; manualFirst.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#template-outputs) |
| P8.01 | Dialog neue Quelle mit anderem Typ/Einheit, Häkchen je umzustellendem Vertrag | erledigt; Teilumzug mit anderem Gerät; derselbe physische Datenpfad verlangt Umstellung aller Altverwendungen, um doppelte Nachweise zu verhindern | sourceMigration.test.tsx; QUELLENUMZUG.md | [Chrome/Firefox](BROWSER.md#source-move) |
| P8.02 | Alte Quelle und Geschichte bleiben erhalten; Referenzen bewusst umstellen | erledigt; Historie unverändert, einfache Gerätevorlagen als neue Version; eigene komplexe Regeln verlangen ausdrücklich vorbereitete passende Vorlagenversion | test_alpha7_source_migration.py; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#source-move) |
| P8.03 | Alltagstext für immutable_source_type mit Umzugsknopf | erledigt | sourceMigration.test.tsx; IssueList | [Chrome/Firefox](BROWSER.md#source-move) |
| P8.04 | Server-Validierung, Dialogtest und Engine-E2E | erledigt | sourceMigration.test.tsx; test_alpha7_source_migration.py; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#source-move) |
| P9.01 | ADR 0004 angenommen nach Bennis Auftrag, kein generisches set_state | erledigt; ADR 0004 angenommen gemäß Auftrag, ausschließlich begrenzter administrativer Neustart | ADR 0004; test_alpha7_manual_restart.py | [Chrome/Firefox](BROWSER.md#manual-restart-impact) |
| P9.02 | Freigabe pro Ablauf, Standard aus, unveränderliche Definition; ohne Freigabe sichtbarer Grund | erledigt | test_alpha7_manual_restart.py; manualRestart.test.tsx | [Chrome/Firefox](BROWSER.md#template-restart-permission) |
| P9.03 | Nur serverseitig autorisierter Administrator, ausschließlich definierter Startzustand | erledigt | test_alpha7_manual_restart.py | [Chrome/Firefox](BROWSER.md#manual-restart-impact) |
| P9.04 | Bestätigung und direkter/transitiver Impact, Hinweis auf unbekannte externe Automationen | erledigt | manualRestart.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#manual-restart-impact) |
| P9.05 | Neue Episode, origin=manual, Zeitpunkt/Grund/Akteur und Audit atomar | erledigt | test_alpha7_manual_restart.py; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#manual-restart-result) |
| P9.06 | ID, Ablaufzeit, OCC, Idempotenz, Commitfehler, kein Replay nach Restore | erledigt | test_alpha7_manual_restart.py; test_postgres.py; manualRestart.test.tsx | [Chrome/Firefox](BROWSER.md#manual-restart-impact) |
| P9.07 | Kennzeichnung in Envelope/WS/Diagnose bis datengetriebener Bestätigung | erledigt; manuell bleibt eingeschränkt/unverfügbar bis zu gesundem entscheidendem Datennachweis; Timer/Befehle/Restore können die Markierung nicht löschen | test_alpha7_manual_restart.py; e2e.test.tsx; presentation | [Chrome/Firefox](BROWSER.md#manual-restart-result) |
| P9.08 | API-, Engine-, Autorisierungs-, Audit-, Restore- und Frontend-Nachweise | erledigt; lokale API-/Engine-/Frontend-Nachweise und vollständige PR-CI, einschließlich PostgreSQL-Prozessneustart | ABLAUF-NEUSTART.md | [Chrome/Firefox](BROWSER.md#manual-restart-impact) |
| P10.01 | Ein Speichern statt zwei | erledigt | versions.test.tsx | [Chrome/Firefox](BROWSER.md#versions-with-note) |
| P10.02 | Versionen mit Zeit, Wer und optionaler Notiz | erledigt; dauerhafte redaktionelle Metadaten ausdrücklich freigegeben. Wer = authentifizierte Rolle/Zugangsart; persönliche Namen nicht umgesetzt, da keine personenbezogene Anmeldung existiert. Altbestand ohne Nachweis wird ehrlich gekennzeichnet | versions.test.tsx; test_alpha7_version_metadata.py; VERSIONEN.md | [Chrome/Firefox](BROWSER.md#versions-with-note) |
| P10.03 | Zurücksetzen nur auf ältere Versionen | erledigt | versions.test.tsx; lifecycle.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#rollback-confirmation) |
| P10.04 | Neue Objekte im Diff ohne bedrohliche Warnplaketten; Prüfsummen Erweitert | erledigt | versions.test.tsx | [Chrome/Firefox](BROWSER.md#takeover-confirmation) |
| P10.05 | Eigene Import-/Export-Unterseite | erledigt | navigation.test.tsx | [Chrome/Firefox](BROWSER.md#changes-transfer) |
| P11.01 | Graph bei 1920 lesbar, Entwurf/live markiert | erledigt; lesbare Startgröße 100 Prozent, Verschieben/Fokussieren statt unlesbarem Einpassen; Entwurf ohne Live-Farben | graphEvidence.test.tsx; buildGraph.test.ts | [Chrome/Firefox](BROWSER.md#relations) |
| P11.02 | Kein grauer Knopf ohne Grund | erledigt | graphEvidence.test.tsx | [Chrome/Firefox](BROWSER.md#relations) |
| P11.03 | Nachweis mit Quellenauswahl und Tabelle statt Tippfeld/JSON | erledigt | graphEvidence.test.tsx; diagnostics.test.tsx | [Chrome/Firefox](BROWSER.md#diagnostics-evidence) |
| P12.01 | Gedämpftes Petrol nur Marke/Navigation/Hauptknopf | erledigt | presentation.test.tsx; FARBEN-SPRACHE.md | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P12.02 | Exklusive Statusfarben Grün/Gelb/Rot/Grau/Blau, keine Dekoration | erledigt | presentation.test.tsx; status.test.ts | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P12.03 | Gesund-Grün unterscheidbar; WCAG AA für alle Status-Chips, besonders Grau | erledigt; mindestens 4,5:1 für alle Status-Chips auf vier verwendeten Flächen und für Hauptknöpfe einschließlich Hover | presentation.test.tsx | [Chrome/Firefox](BROWSER.md#contracts-list) |
| P13.01 | Historische Alpha-6-Veröffentlichung korrekt dokumentieren | erledigt; Alpha-6-Release und unverändertes main erneut auf GitHub verifiziert | GitHub v1.0.0a6; main 4687c35 | entfällt: Dokument-/Test-/CI-Nachweis |
| P13.02 | Workbench-README und CHANGELOG neue Struktur | erledigt | Routenabgleich navigation.test.tsx | entfällt: Dokument-/Test-/CI-Nachweis |
| P13.03 | Release-Notiz 1.0.0a7 | erledigt | docs/releases/1.0.0a7.md | entfällt: Dokument-/Test-/CI-Nachweis |
| P13.04 | Versionen App/Python/Frontend 1.0.0a7 vorbereiten | erledigt; App/Python 1.0.0a7, Frontend 1.0.0-alpha.7; keine Veröffentlichung | test_image_distribution.py; Build; verify:dist | [Chrome/Firefox](BROWSER.md#settings-installation) |
| T.01 | Vitest/RTL je Paket und bestehende Regressionen | erledigt; 264 Frontendtests plus acht Sprachscanner-Tests, 489 Backendtests lokal; 21 umgebungsgebundene Backendtests lokal übersprungen, zusätzliche Umgebungsprüfungen in der CI | npm test; pytest; test:i18n-lint | entfällt: Dokument-/Test-/CI-Nachweis |
| T.02 | Engine-E2E mit originaler UX12-Datei über Geräteführung ohne manuelle Transformation | erledigt; fünf echte Engine-E2E mit isolierter MemoryStore-App; Originaldatei ohne manuelle Transformation | src/e2e.test.tsx: fünf Fälle | [Chrome/Firefox](BROWSER.md#device-guide) |
| T.03 | i18n-Scan 0, en.json unverändert | erledigt; 0 harte Oberflächentexte; en.json hat gegenüber der verbindlichen Basis 4687c35 keinen Diff | scan:i18n; git diff 4687c35 -- en.json | entfällt: Dokument-/Test-/CI-Nachweis |
| T.04 | Firefox und Chrome 1920×1080, jede Seite/Unterseite vorher/nachher, PR-Anhang | erledigt; 162 Originalbilder und echte Interaktionen in Chrome/Firefox 1920×1080; isolierte Browser ohne sichtbares Fenster; keine Prüfung eines persönlichen Profils | browser-review.mjs; Manifest mit SHA-256 | [Chrome/Firefox](BROWSER.md#overview) |
| T.05 | Vollständige CI auf PR-Head grün; danach Stopp vor Merge/Release | erledigt nach finalem grünem CI-Lauf; exakter Head und Run im PR verlinkt, anschließend Stopp vor Merge/Release | CI: platform, frontend, ha-bridge, workbench-e2e, amd64, aarch64 | entfällt: Dokument-/Test-/CI-Nachweis |
| A11.01 | Terra überall | erledigt | navigation.test.tsx; manualCoverage.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| A11.02 | Einstellungen statt Administration | erledigt | navigation.test.tsx; admin.test.tsx | [Chrome/Firefox](BROWSER.md#settings-system) |
| A11.03 | Übersicht mit Aktionen/Problemen/gefilterten Ereignissen, ohne Bereiche | erledigt | overview.test.tsx | [Chrome/Firefox](BROWSER.md#overview) |
| A11.04 | Nicht bereit · n mit Lösungslink | erledigt | readiness.test.tsx | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| A11.05 | Vertragstabelle eine Spalte Zustand | erledigt | contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contracts-list) |
| A11.06 | Vorlagen eigene Unterseite | erledigt | navigation.test.tsx; templates.test.tsx | [Chrome/Firefox](BROWSER.md#templates-own) |
| A11.07 | Neuer Vertrag startet Entwurf, keine Hinweiskästen | erledigt | draftMode.test.tsx; devices.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| A11.08 | Live/Bearbeiten und n Änderungen/Prüfen/Übernehmen | erledigt | draftMode.test.tsx; draftOwnership.test.tsx | [Chrome/Firefox](BROWSER.md#draft-details) |
| A11.09 | Grau = unbekannt | erledigt | presentation.test.tsx; status.test.ts | [Chrome/Firefox](BROWSER.md#contracts-list) |
| A11.10 | Texte in de.json | erledigt | scan:i18n; ui-strings.test.mjs | [Chrome/Firefox](BROWSER.md#diagnostics-evidence) |
| TOP.01 | Zahl-/Ja-Nein-Quellen richtig lesen oder warnen | erledigt | test_alpha6.py; devices.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#device-guide) |
| TOP.02 | Übernehmen in Leiste, Bestätigung sichtbar | erledigt | draftMode.test.tsx; browser-review.mjs | [Chrome/Firefox](BROWSER.md#takeover-confirmation) |
| TOP.03 | Geführtes HA-Gerät ohne Sackgasse | erledigt | devices.test.tsx; e2e.test.tsx; browser-review.mjs | [Chrome/Firefox](BROWSER.md#device-guide) |
| TOP.04 | HA/Bridge-Status wahr; Bereitschaftsplakette mit Lösung | erledigt | readiness.test.tsx; test_alpha7_discovery.py | [Chrome/Firefox](BROWSER.md#readiness-conditions) |
| TOP.05 | Wörterbuch, keine Rohcodes, Terra | erledigt | scan:i18n; presentation.test.tsx; status.test.ts | [Chrome/Firefox](BROWSER.md#contracts-list) |
| TOP.06 | Ablaufeditor, Wiederherstellung, Neustart, Befehle auf Vertrag | erledigt | test_alpha6.py; test_alpha7_manual_restart.py; manualRestart.test.tsx; e2e.test.tsx | [Chrome/Firefox](BROWSER.md#template-restart-permission) |
| TOP.07 | Vertragsliste Wert/Zustand, Detail Einheit/Ja-Nein/Warum/Woher/Verlauf | erledigt | contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contract-detail) |
| TOP.08 | Handlungsorientierte Fehlermeldungen inkl. Einheit/Zyklus/Geheimnis/Limit/Feld | erledigt | alpha6.test.tsx; test_alpha6.py; navigation.test.tsx | [Chrome/Firefox](BROWSER.md#contract-import) |
| TOP.09 | Sicherer Assistent, Weiter, Abschluss, Schrittleiste | erledigt als Alpha-6-Regression im sicheren Assistenten; kompletter realer Erstinstallationsdurchlauf nicht durchgeführt, da keine Installation/echte Verbindung beauftragt ist; Schrittleiste und Abschluss durch RTL geprüft | wizard.test.tsx; test_setup.py | [Chrome/Firefox](BROWSER.md#settings-installation) |
| TOP.10 | Neue Navigation, Vorlagen, keine Hinweiskästen, Experten-Diagnose | erledigt | navigation.test.tsx; draftMode.test.tsx; graphEvidence.test.tsx | [Chrome/Firefox](BROWSER.md#templates-own) |
| TOP.11 | Statusfarben und eingeschaltet | erledigt | presentation.test.tsx; contracts.test.tsx | [Chrome/Firefox](BROWSER.md#contracts-list) |
| TOP.12 | Konflikt-Kopie und aktuelle Version | erledigt | draftSafety.test.tsx; versioning.test.tsx | [Chrome/Firefox](BROWSER.md#template-new-version) |
| TOP.13 | ID-Grenzen, lange Texte, Entwurfslimit | erledigt | alpha6.test.tsx; test_alpha6.py; manualCoverage.test.tsx | [Chrome/Firefox](BROWSER.md#contract-config) |
| TOP.14 | Nachweis als Tabelle mit Auswahl | erledigt | graphEvidence.test.tsx; diagnostics.test.tsx | [Chrome/Firefox](BROWSER.md#diagnostics-evidence) |
| TOP.15 | Neue Übersicht, kein roher Ereignisstrom | erledigt | overview.test.tsx; live.test.ts | [Chrome/Firefox](BROWSER.md#overview) |

## Bewusst nicht umgesetzt und verbleibende Abnahme

| Punkt | Status / Grund | Nachweis |
|---|---|---|
| HA-Verbindungshistorie über Browsersitzungen hinweg | nicht umgesetzt: vorhandene API enthält keinen dauerhaften Verbindungsereignisstrom; kein zusätzlicher Backend-Auftrag | P3.05; overview.test.tsx; sichtbarer Sitzungs-Hinweis |
| Persönlicher Name bei Versionen | nicht umgesetzt: das System authentifiziert Zugangsrollen, keine Personen; Rolle/Zugangsart und Notiz werden dauerhaft erfasst | P10.02; VERSIONEN.md |
| Teilumzug mit identischem physischem Datenpfad und verbleibenden Altverweisen | nicht umgesetzt: würde zwei Quellen denselben Nachweis doppelt zählen lassen; anderes Gerät für Teilumzug oder alle Altverwendungen umstellen | P8.01; QUELLENUMZUG.md; Server-/Engine-Tests |
| Automatische Neuinterpretation beliebiger eigener Vorlagen beim Quellenumzug | nicht umgesetzt: würde fremde Regeln verändern; einfache Gerätevorlagen werden versioniert, passende eigene Versionen ausdrücklich ausgewählt | P8.02; sourceMigration.test.tsx |
| Native Browserfenster, persönliches Profil, kompletter echter Einrichtungsdurchlauf | nicht durchgeführt: Nachweis verwendet isolierte Chrome-/Firefox-Engines ohne sichtbares Fenster und synthetische App; Assistent durch RTL/Setup-Tests geprüft | BROWSER.md; wizard.test.tsx; test_setup.py |
| Claude-UX-Nachtest und Bennis Live-Abnahme | nicht durchgeführt: nachgelagerte Gates des Auftrags | PR #20; Issue #19 |
| Merge, Tag, Release, Image-Publish, Installation, DB-Reset/K7 | nicht durchgeführt: ausdrückliches Go fehlt; K7 benötigt separates Go nach Installation | Freigabegrenze |

## Verifikation und Freigabegrenze

## Korrekturen nach UX-Nachprüfung

| Punkt | Anforderung | Status / Grund | Test | Screenshot |
|---|---|---|---|---|
| K.01 | Ein aktueller Serververgleich zählt hinzugefügte, geänderte und entfernte Objekte; sonst „…“ | erledigt; identische Stände ergeben 0, keine Browser-Pfaddifferenz | corrections.test.tsx; geführter Vertrag und identischer Stand im Engine-E2E | neue Bilder unter K.06 folgen |

### Vorheriger Gesamtnachweis

Frontend: 264 Tests, acht Scanner-Regressionen, TypeScript, Build/dist und Sprachscan grün.
Backend: 489 Tests lokal grün, 21 umgebungsgebundene Prüfungen lokal übersprungen; vollständige CI
mit PostgreSQL, MQTT, HA-Kernel sowie beiden Image-Architekturen ist auf dem finalen PR-Head verlinkt.
Fünf Engine-E2E laufen separat gegen die echte lokale App; der zugehörige Kindprozess wird auch bei Fehlern beendet.
Die UX12-Datei bleibt als Original erhalten; zwei bekannte fachliche Fehler werden über die Oberfläche korrigiert,
Typumwandlungen ausschließlich über die Geräteführung erzeugt. Keine vorgeschaltete Transformation.

Ein Issue, ein Branch, ein PR, Paket-Commits P1–P13. Keine Änderungen an en.json, Legacy,
Home Assistant oder Einhornzentrale. Keine Produktion-Verbindung und kein DB-Reset.
Die CI baut Images mit `push: false`. Version 1.0.0a7 ist vorbereitet, nicht veröffentlicht.
Nach grüner CI und Übergabe wird gestoppt. Merge, Tag, Release, Image-Publish und Installation
bleiben bis Bennis ausdrücklichem Go gesperrt.
