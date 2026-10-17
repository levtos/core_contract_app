# Alpha 7 – Korrekturen K.01–K.06

Fortsetzung in [PR #20](https://github.com/levtos/core_contract_app/pull/20),
ausgehend von `5f1d7fc`. Kein neuer PR und keine Veröffentlichung.

Der Änderungszähler verwendet die Objektgruppen der Serverprüfung:
hinzugefügt + geändert + entfernt, über alle Objektarten. Die zusätzliche
Vertragsliste im Ergebnis wird nicht noch einmal gezählt. Ein ungeprüfter,
veralteter oder gerade geprüfter Stand zeigt „…“. Leiste und Entwurfsseite
verwenden denselben aktuellen Vergleich. Die Engine-E2E prüfen einen
geführten Vertrag und anschließend einen identischen aktiven Stand.

Die Leiste bündelt Modus, Entwurfsname mit einem Speicherzustand, Zähler,
kurzen Prüfstatus, Prüfen, Übernehmen und das ⋯-Menü. Speichern steht im Menü
und bleibt mit Strg+S erreichbar. Auf der Entwurfsseite zeigt ein Kasten das
Prüfergebnis; die Übernahmekarte enthält nur die beiden Voraussetzungen.

Der Menüpunkt „Vertrag“ entfällt. Die alte Auswahlroute leitet zu „Meine
Verträge“ weiter; bei einem Detail ist dieser Eintrag markiert. Die deutschen
Texte unterscheiden Einschalten von Verträgen und Übernehmen von Entwürfen.
Prüfsummen, Entwurfskennung und Fristdetails sind unter „Erweitert“ erreichbar.
Zeitwerte werden auf Deutsch in Berliner Zeit angezeigt, ihre gespeicherten
Zeitpunkte bleiben unverändert. Die Geräteführung erklärt 900 Sekunden als
15 Minuten. Bekannte gesunde/eingeschränkte/ausgeschaltete Zahlen verwenden
Grün/Gelb/Grau; eingeschaltet bleibt neutral. Die HA-Kennung erscheint als
zusätzliche Zeile nur bei einem abweichenden Namen.

## Browserprüfung

Echtes Google Chrome 155.0.8059.80 und Firefox/Gecko 157.0, jeweils
1920×1080, deutsche Sprache, Berliner Zeitzone, isoliertes Profil ohne
sichtbares Fenster. Die eigene App arbeitet ausschließlich mit flüchtigen,
synthetischen Daten. Es bestehen keine Verbindungen zu HA, einer echten
Datenbank oder MQTT. Eigene Testprozesse werden auch im Fehlerfall beendet.

Die folgenden **18 Originalbilder** wurden visuell gesichtet. Das
[Manifest](screenshots/manifest-both-corrections.json) nennt Quellstand,
Browser, Route, Abmessungen und SHA-256. Die früheren 162 Bilder bleiben als
historischer Vorher-/Nachher-Nachweis erhalten. Kontaktblätter dienen nur der
Sichtung; die verlinkten PNGs sind unverändert.

| Aufgabe | Chrome | Firefox |
|---|---|---|
| Übersicht mit offenem Entwurf | [Original](screenshots/corrections/chrome/overview.png) | [Original](screenshots/corrections/firefox/overview.png) |
| Meine Verträge | [Original](screenshots/corrections/chrome/contracts-list.png) | [Original](screenshots/corrections/firefox/contracts-list.png) |
| Vertragsdetail | [Original](screenshots/corrections/chrome/contract-detail.png) | [Original](screenshots/corrections/firefox/contract-detail.png) |
| Entwurf identisch, beide Zähler 0 | [Original](screenshots/corrections/chrome/draft-details.png) | [Original](screenshots/corrections/firefox/draft-details.png) |
| Geführter neuer Vertrag, beide Zähler 4 | [Original](screenshots/corrections/chrome/draft-changed.png) | [Original](screenshots/corrections/firefox/draft-changed.png) |
| Übernahme-Dialog | [Original](screenshots/corrections/chrome/takeover-confirmation.png) | [Original](screenshots/corrections/firefox/takeover-confirmation.png) |
| Geräteführung mit Minutenhilfe | [Original](screenshots/corrections/chrome/device-guide.png) | [Original](screenshots/corrections/firefox/device-guide.png) |
| Seitenleiste | [Original](screenshots/corrections/chrome/sidebar.png) | [Original](screenshots/corrections/firefox/sidebar.png) |
| Versionen mit deutschem Datum | [Original](screenshots/corrections/chrome/versions.png) | [Original](screenshots/corrections/firefox/versions.png) |

Automatische Browserprüfungen bestätigen in beiden Browsern die Zähler 0/4,
die markierte Vertragsliste, den entfernten Menüpunkt, die Minutenhilfe,
Schnellaktionshöhen von jeweils 36 px und den sichtbaren Bestätigungsknopf.
Keine JavaScript-/HTTP-Fehler und kein horizontaler Dokumentüberlauf.

Wiederholung nach dem Frontend-Build:

```powershell
node scripts/browser-review.mjs --browser both --phase corrections
```

## Verifikation und Grenze

Komponententests und echte Engine-E2E sichern die Änderungen ab. Der komplette
Frontendlauf, TypeScript, Sprachscan (0 harte Texte), acht Scanner-Tests und
Build/dist werden vor Übergabe geprüft. Die vollständige CI ist am neuen
PR-Head verlinkt; der vorherige grüne Lauf ersetzt diesen Nachweis nicht.

Danach Stopp für die unabhängige UX-Nachprüfung und Bennis Live-Abnahme.
Kein Merge, Tag, Release, Image-Publish, Installation oder DB-Reset ohne Go.
Legacy, HA und Einhornzentrale bleiben unverändert.
