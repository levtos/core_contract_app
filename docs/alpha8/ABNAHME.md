# Alpha 8 — Abnahme für A2-Review

Basis a08a51d; ein Branch agent/codex-alpha8-mimir, ein
[PR #25](https://github.com/levtos/core_contract_app/pull/25). A1 ist durch Claude
mit fünf eingearbeiteten Auflagen freigegeben. **A2 endet hier für Review.
Keine Merge-, Release-, Installations- oder DB-Ausführungsfreigabe.**

| Block | Commits (Hauptänderung) | Nachweis |
|---|---|---|
| Teil 0/A1 + Auflagen | 82dc2dc, 6e4b25e, 5165e9c | ADR 0005–0011, Spezifikation §13, Kommentar #24 |
| Mimir/Bifröst/Versionslinie | ecf99c5 | test_version_lines, test_scope_packaging, test_image_distribution, test_bridge_kernel; beide Image-Jobs |
| G18 freie Kennungen/keine Fixture-Pflicht | af496ef | test_alpha8_platform, test_phase1a; React alpha7/templates |
| G19 Instanzparameter | b309132, 0787201 | test_instance_parameters: Typ/Relation/Fingerprint/Isolation/Restore/Zeitzonen; React alpha8/parameters |
| G1 Uhr/Kalender | 24590f4, 2a385fc | test_calendar_inputs: DST, minute_of_day, day_of_year, Auflösung, Termin/Neustart |
| G17 normale HA-Freshness/Connectivity | 9047eb9 | test_ha_freshness: stateful ohne Ablauf, TTL/Heartbeat, gespeicherte Evidence, Connectivity; React overview |
| G13 n Klassen | 460eb55, f2680dd | test_multibucket: dynamische Grenzen, große Sprünge, Initial-unknown-Roundtrip, Restart |
| G3 geschlossene Textoperatoren | db84239 | test_text_rules: Normalisierung/Muster/Grenzen/zusammengesetzte Schlüssel |
| G5 Lebenszyklus | 4b794e8 | test_version_lifecycle: immutable Inhalt, gepinnte Nutzung, Retired-Sperre, explizite Wiederfreigabe |
| G6 benannte Formeleingänge | 35f8fc5 | test_named_formulas: gemischte Einheiten, Pflichtnamen, typisierte Metadaten, Lebenszyklus |
| G14 Vollständigkeit | 65a82f7 | test_configuration_completeness; React overview: gültiger Wert zählt gesund, eigene Problemliste |
| F1/F2 | e3a50be, 21720b0 | test_retention, test_retention_postgres, test_partial_evaluation; alpha8_scale_probe, reale PostgreSQL-CI |
| #23 | a0c0c60, e0bb6ad | test_alpha7_post1; React contracts/post1-source: Quelle mit Name, Stufe bis jetzt, Lücken/unknown; Wörterbuch ohne Akteur/Semantik |
| Editor-/Sprachintegration | e0bb6ad, f4faa07 + Folgecommit | freie Vorlagen, lifecycle, dynamische Buckets, Parameter-Einheiten, neue Regelreferenzen, i18n-Scan |
| G20 | Dokumentation | [Prüfbefund](platform.md#g20-nur-geprüft); kein neuer Event-Kanal gebaut |

## Automatisierte Nachweise

Der erste vollständige Lauf
[39027011751](https://github.com/levtos/core_contract_app/actions/runs/39027011751)
für f4faa07 war grün: Backend 557 bestanden / 1 bedingt ausgelassen,
Frontend 289 bestanden / 5 separate E2E-Fälle ausgelassen; der eigene
Workbench-E2E-Job führt diese fünf gegen echte API/Engine aus. Bifröst,
amd64/aarch64-Package-Inhalt und amd64-Lifecycle-Smoke bestanden.

Die abschließende Wiederholung einschließlich der ergänzten Regressionen und
Dokumente ist verbindlich über die [Checks des aktuellen PR-Heads](https://github.com/levtos/core_contract_app/pull/25/checks).
Der Abschlusskommentar in #24 nennt exakte SHA und Run-ID. Lokale PostgreSQL-
Tests werden ohne isolierte Test-DB ausgelassen; diese sind durch CI abgedeckt.
Ruff, Format, mypy --strict, tsc, Frontend-Build/Distprüfung, Abhängigkeitsprüfungen
und **i18n-Scan: 0 harte Oberflächentexte** gehören zu den CI-Pflichtschritten.

Versionsgate lokal und CI: AwesomeVersion 25.8.0, sechs vorhandene Versionstags
v1.0.0a3 bis v1.0.0a7.post1, tatsächlicher slug je Tag core_contracts; alle
„andere App“. Insbesondere a8 > a7.post1 bleibt false und wird korrekt
protokolliert, ohne eine andere Supervisor-Linie zu blockieren.
Keine neuen Tags erzeugt.

F1/F2: CI-Artefakt python-wheels enthält dist/alpha8-scale.json mit Queryplänen.
Der erste Vollnachweis maß 1.024 Verträge bei deklarierter Rate 2 Meldungen/s,
P95 138,264 ms, 1 ausgewertet/1.023 wiederverwendet. Bei 1 Mio. Rohmessungen:
Evidence 0,535 ms, neueste Seite 2,486 ms, Quelle/Zeit 2,665 ms P95;
Rohhistorie plus Sidecar/Indizes 1.376.026.624 Byte. Budget: 500/250 ms und
2 GB. Der abschließende Probe prüft Quelle/Zeit zusätzlich mit einer selektiven
1-%-Quelle und verlangt den zusammengesetzten Quellen-/Zeitindex.
[Horizont, Verfahren und verbleibende O(n)-Kosten](retention-scaling.md).

## Firefox 1568 × 710

Echte gebaute Oberfläche + echte HTTP/WS-API/Engine, flüchtiger MemoryStore,
ausschließlich synthetische lokale Werte. Kein Home Assistant/PostgreSQL/Live-
System verbunden. Vier Bilder, sichtbar geprüft; capture.json protokolliert
Auflösung und erfolgreiche Verhaltensassertionen. Reproduzierbar mit
dev/workbench_demo.py --alpha8 und frontend/scripts/capture-alpha8.mjs.

| Fläche | Bild / Nachweis |
|---|---|
| Mimir-Kopf und HA-Trennung | [01-mimir-kopf.png](screenshots/01-mimir-kopf.png) |
| Übersicht: Signal und Konfiguration getrennt | [02-uebersicht.png](screenshots/02-uebersicht.png) |
| Gültiger Wert mit Vollständigkeitshinweis | [03-vollstaendigkeit.png](screenshots/03-vollstaendigkeit.png) |
| Parameter am Vertrag, Einheit, Entwurfhilfe | [04-vertragsparameter.png](screenshots/04-vertragsparameter.png) |

Parameter im Browser von 19 auf 20 °C geändert; aktive Registry per echter API
weiterhin 19 °C. Keine Übernahme. Keine pageerror-Ereignisse.

## Offene Owner-/Betriebsschritte

- Repo-Umbenennung Levtos/core_contract_app → Levtos/mimir ist vorbereitet,
  aber nicht ausgeführt: levtos-codex hat Push-, keine Admin-/Maintain-Rechte.
  Vor Rename Terra-Images/Release-Assets inventarisieren, danach Abrufbarkeit
  und GitHub-Weiterleitung prüfen. Keine Identitätsumschaltung.
- Teil B bleibt bis Bennis Go gesperrt: Tag/Pre-Release, Images mit Digests,
  neue DB/Rolle auf dem benannten PostgreSQL-Ziel nach vorbereitetem Runbook,
  neue Mimir-App und Bifröst via HACS, Version/Startlog/Ingress/Verbindung.
- In Teil B Supervisor-Repo-Weiterleitung prüfen; falls nötig neue URL im
  App-Store ergänzen und Terra-Eintrag erhalten.
- Terra-App-Store-config ist bytegleich zur Basis; installierte Terra, alte
  Bridge und Legacy v0.2.4 wurden nicht angefasst. Keine reale Live-Abnahme.

Nicht enthalten: G2/G7/G8/G9/G10/G12/G15/G16 (Alpha 9), G4 und UX-Ordnung
(Alpha 10). Dokumentation oder synthetische Bilder ersetzen keine Teil-B-Abnahme.
