# Alpha 7 Korrektur — 1.0.0a7.post1

Auftrag: [Issue #21](https://github.com/levtos/core_contract_app/issues/21),
Basis `main@737db9f`. Teil A endet vor Merge/Release/Installation bei Claude-Review.
Keine neue Gesamtabnahmematrix; die Alpha-7-Matrix bleibt historisch.

| Befund | Änderung / Untersuchung | Nachweis |
| --- | --- | --- |
| B1: abweichende Plakette, Zahl und Filter | Gemeinsame `contractState`-Kategorie/Farbe aus Servergesundheit. Feldgründe und Transportalter ergänzen den Hinweis. Filter entsprechen den fünf Kategorien einschließlich aus/Entwurf/noch ohne Serverzustand. | `overview.test.tsx`: gleicher Envelope mit unbekanntem, veraltetem Feld in Zähler, Filter und Plakette; [Übersicht](screenshots/post1/firefox/overview.png), [Gesund-Filter](screenshots/post1/firefox/list-healthy.png). |
| B2: pauschale Typsperre | Annahme-/Ablehnungsregeln unverändert. Historie liefert auf Anfrage die Ursprungs-Version; Meldung nennt Feld, Alt/Neu und Version. | `test_alpha7_post1.py`: unveränderte aktive Kopie bei konsistenter Historie gültig, historischer Einheitskonflikt konkret; `post1-source.test.tsx`: deutscher Fehlertext. |
| B3: endloser Ladezähler bei Fehler | Nach abgeschlossener ungültiger Prüfung „– / erst nach Fehlerkorrektur“. Laden/erneut prüfen weiterhin „…“, nie Teilvergleich. | `corrections.test.tsx`: Ablehnung und anschließende Reparatur; [Fehlerleiste](screenshots/post1/firefox/draft-invalid.png). |
| B4: zu viele Dezimalstellen | Anzeigepräzision nach Einheit; Minuten/°C je eine Nachkommastelle. Speicher- und Auswertungswerte unverändert. | `post1-format.test.ts`, Vertrags-Komponententests; [gerundete Liste](screenshots/post1/firefox/list-rounded.png). |
| B5: Kennung statt Name, doppelte Anlage | Quellenname (sonst HA-Name), Kennung klein darunter; Du-Form, nur Kopfknopf. Manuelle Anlage bleibt im Dialog über „Ohne Gerät anlegen“ erreichbar. | Geräte-/Entwurfs-/Manual-first-Tests; [Quellenliste](screenshots/post1/firefox/sources-list.png). |
| B6: doppelte Aktualität, unzutreffende Pflichtfelder | Überschrift einmal; Intervall nur außerhalb des zustandsbasierten Modus, mit Minutenhilfe. Erreichbarkeitsquelle nur im gleichnamigen Modus; vorhandene ungenutzte Angaben bleiben gespeichert. | `post1-source.test.tsx`, bestehende Servervalidierung; [Aktualität](screenshots/post1/firefox/source-freshness.png). |
| B7: schmaler, unbeschrifteter Verlauf | Volle Breite, Werte/Einheiten an der Achse, Ja/Nein-Stufen. Lücken bleiben Lücken; gleiche Zeitpunkte werden nach Veröffentlichungsnummer sortiert. | `contracts.test.tsx`: Stufen, Achse, Lücken und Zeitgleichheit; [Verlauf](screenshots/post1/firefox/contract-boolean-history.png). |
| B8: unkonkretes Warum | Betroffener Eingang mit Quellenname und Alter seiner letzten Messung. Fehlende Messzeit bleibt unbekannt; Empfangszeit/Grundbeginn werden nicht als Messung verwendet. | `contracts.test.tsx`: Quellenname, fünf Minuten Messalter, fehlende Messzeit; [Warum und Verlauf](screenshots/post1/firefox/contract-boolean-history.png). |
| B9: Sprachreste | Stand/Grundlage, „Wer: nicht bekannt“, „Gespeicherten Stand laden“, Du-Form, „Fehler im Entwurf“, Werteliste/Berechnungskennung und Grammatik; 179 obsolete Schlüssel entfernt. Dynamische Server-Enums behalten Übersetzungen. `en.json` unverändert. | Konflikt-/Versions-/Editor-Tests; i18n-Scan 0, statische Schlüsselprüfung 0 ungenutzt; [Speicherkonflikt](screenshots/post1/firefox/save-conflict.png). |
| B10: HA-Beschreibung Alpha 6 | App-Config beschreibt Terra/Alpha 7. Nur Vorbereitung im Repository, keine Installation. | `core_contracts/config.yaml`, Image-Vertrag in CI. |
| B11: Flattern der Differenz | Nur untersucht: Verfall des Thermostat-Eingangs nach einer Stunde und Erholung durch neuen Bericht; keine Fachlogik geändert. | Historische Gründe vor dem Alpha-7-Update, unten; synthetischer Engine-Test `test_optional_delta_flaps_only_when_heartbeat_input_expires_and_recovers`. |

## Fachliche Einordnung B1, B6 und B11

**B1:** `contract_health=healthy` bei einem optionalen unbekannten Feld ist gemäß
[Spezifikation §7](../../platform-alpha1/build-specification.md) korrekt:
Die Gesundheit wird ausschließlich aus Pflichtfeldern gebildet. In der betrachteten
Fenster-Vorlage ist `differenz` optional (`required=false`). Die UI darf daraus keinen
anderen Vertragszustand berechnen. Die Backend-Regel bleibt unverändert.

**B6:** `Freshness.required` verlangt ein Intervall für alle Modi außer `event_stateful`.
`liveness_source` ist nur im Modus `liveness_source` Pflicht; ein leeres optionales
`null` in anderen Modi ist gültig. Die UI zeigt die Pflicht nur in diesem Modus und
nutzt die vorhandene Servervalidierung. Eine zusätzliche globale Pflicht wäre fachlich falsch.

**B11:** Die vorliegende Konfiguration bindet `temperatur` an eine zustandsbasierte Quelle
und `vorher` an den Thermostat mit `report_heartbeat`, Frist **3600 s**. Beide müssen für
die Differenz verwendbar sein. Die **300 s** der `delta`-Regel werden im vorhandenen
Delta-Zweig nicht als Verfallsfrist angewendet (`producer.temporal` / `temporal.delta`).
Ein neuer Bericht stellt den Eingang wieder her; nach seiner Frist wird das optionale
Ergebnis erneut unbekannt. Änderungen an diesem Verhalten sind ausdrücklich nicht enthalten.

Für die Ursachenprüfung wurde allein die bestehende App-Lese-API mit einer auf
15 Einträge begrenzten Vertragshistorie verwendet, kein direkter DB-Zugriff und keine
HA-Änderung. Die gespeicherten Einträge **vor** dem Alpha-7-Update belegen am 17.10.2026 (UTC):

- `02:23:02`: Differenz unbekannt, Grund `input_stale`, Eingang `source.thermostat_temperatur`.
- `02:27:21`: Differenz wieder gültig; auch um `03:13:53` noch gültig.
- `03:27:21`: wieder unbekannt, derselbe Eingang und Grund nach Ablauf der Stunde.

Das erklärt die nachgewiesenen Wechsel durch die Aktualität des Eingangs. Die Häufigkeit
aller alten Logzeilen ohne eigene Messzeiten wird nicht aus den Zeilen geschätzt.
Rohdaten, private Entitätsnamen und Verbindungsdaten wurden nicht übernommen.

## Versions-Gate und offene Release-Grenze

Reproduzierbar: `uv run --with awesomeversion==25.8.0 python dev/verify_postrelease.py`.
Dieser Pin entspricht dem beim Prüfen gelesenen
[Supervisor-Pin](https://github.com/home-assistant/supervisor/blob/main/requirements.txt).
Beide Versionen sind PEP 440; `1.0.0a7.post1` ist gültig und wird als **neuer als
1.0.0a7** erkannt. App, Python und Frontend stimmen überein.

**Zusatzbefund für Review/Release-Planung:** Derselbe AwesomeVersion-Pin bewertet
`1.0.0a8 > 1.0.0a7.post1` als **False**. Die verlangte Alpha-7-Upgrade-Prüfung besteht;
eine spätere Alpha-8-Bezeichnung muss vor deren Veröffentlichung erneut geprüft werden.
Keine eigenmächtige Umnummerierung und keine vorgezogene Alpha-8-Änderung.

## Schlanker Bildnachweis

Genau die acht oben verlinkten Original-PNGs, Firefox **157.0 (Playwright-/Gecko-Testbuild)**,
headless, Innenmaß **1568×710 CSS-Pixel**, Pixelfaktor 1, `de-DE`, `Europe/Berlin`.
Keine Aussage über ein persönliches Firefox-Profil oder die echte Ingress-Einbettung.
Das vorhandene Review-Skript startet nur einen eigenen In-Memory-Prozess auf Loopback,
verwendet eine feste synthetische Uhr und beendet seinen Prozess anschließend.

```text
cd frontend
npm ci
npm run build
node scripts/browser-review.mjs --browser firefox --phase post1
```

[Manifest mit Quell-Commit, Assertions, Abmessungen und Bild-Prüfsummen](screenshots/manifest-firefox-post1.json).
Kein JavaScript-Fehler und kein horizontaler Dokumentüberlauf. Die beabsichtigten
Validierungs- und Speicherkonflikte sind separat durch UI-Assertions geprüft.

Lokal: 283 Frontend-Tests erfolgreich (fünf echte Engine-E2E ohne laufenden Server dort
ausgelassen; separater CI-Job), Backend-Suite, Typprüfung, Ruff, i18n und Build geprüft.
Maßgeblich für den Abschluss ist zusätzlich die vollständig grüne PR-CI auf dem gemeldeten Head.
