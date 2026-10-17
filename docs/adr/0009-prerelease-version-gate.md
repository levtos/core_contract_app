# ADR 0009 — Vorabversionen und vollständige Tag-Prüfung

Datum: 17.10.2026. **Benni beschließt:** neuer Mimir-Slug, Start `1.0.0a8`;
niemals `.postN` oder `.devN` an Vor-Releases. Technischer Prüfplan im Review.
Bezug: [Matrix §7](../audits/akte-gap-2026-10.md),
[#23](https://github.com/Levtos/core_contract_app/issues/23),
[#24](https://github.com/Levtos/core_contract_app/issues/24).

## Modell und Datenformat

Korrekturen erhöhen die Vorabnummer (`a8` → `a9`, `b1` → `b2`), danach `rcN`,
Final und reguläre Patch-Versionen. App, Python-Projekt, Frontend und Bridge
tragen die gleiche Release-Version. API-/Bridge-/Konfigurationsprotokolle
bleiben getrennt. Mimir ist mit neuem Slug eine Neuinstallation; Terra hat
keinen Supervisor-Updatepfad auf `1.0.0a8`.

`dev/verify_postrelease.py` wird in A2 zu einer **Vor-Tag-Prüfung** erweitert:
AwesomeVersion bleibt exakt gepinnt (Basis `25.8.0`), vollständige Tags aus
GitHub/origin lesen, flache/fehlende Historie erkennen, Kandidat validieren,
Metadatenkonsistenz und verbotenes Suffix prüfen, gegen **alle** bisherigen
Versionstags vergleichen. Unlesbare Versionstags oder fehlende Vergleichsdaten
dürfen nicht still übersprungen werden. Nichtversions-Tags werden mit Grund
ausgewiesen. Exit-Code und maschinenlesbarer Bericht sind Release-Voraussetzung.

Berichtsskizze: `{candidate, awesomeversion, tag_snapshot, comparisons:
[{tag, version, newer, slug_lineage, classification}], errors, passed}`.
`slug_lineage` darf nur aus explizit dokumentierten Release-/Slug-Metadaten
stammen, niemals aus dem gewünschten Vergleichsergebnis.

## Offener Widerspruch für Review und Release-Gate

Matrix und vorhandenes Prüfskript dokumentieren bei AwesomeVersion 25.8.0:
`1.0.0a8 > 1.0.0a7.post1` ist **false**. Ein neuer Supervisor-Slug beseitigt den
Updatekonflikt, verändert aber diesen Vergleich nicht. Die GitHub-Umbenennung
behält die historischen Terra-Tags.

Deshalb kann die wörtliche bisherige Matrix-Regel „neuer als **alle** Tags“
mit `v1.0.0a8` nicht grün werden. Es werden weder historische Tags gelöscht
noch Versionsnummer, Bibliothek oder Vergleich still geändert. Teil B bleibt
hier gesperrt, bis Benni eine präzise Gate-Regel bestätigt.

**Review-Vorschlag, noch nicht beschlossen:** alle Tags vergleichen und protokollieren;
strenge Monotonie innerhalb derselben Supervisor-Slug-Linie, dokumentierte
Terra-Vergleiche als andere Installationslinie ausweisen. Für die erste Mimir-
Version zusätzlich den Neubeginn der Linie prüfen. Eine solche Ausnahme ist
eine Änderung der globalen Matrix-Regel und braucht Bennis Entscheidung.
Bis dahin muss die strenge Prüfung beim bekannten Terra-Tag fehlschlagen.

## Beispiele, Tests und betroffene Stellen

Geplant: `a8 > a7`, zweistellige Vorabnummern, `b2 > b1`, `rc1 > bN`, Final,
alle Tags statt nur letztem Tag, historischer `.post1`-Konflikt als Regression,
verbotene neue `.post/.dev`-Vorabversionen, ungültige/fehlende Tags,
Versionsinkonsistenz, unveränderter Pin, keine Tag-Erzeugung bei rotem Gate.
Eine genehmigte Linienregel benötigt separate Tests für richtige/falsche
Zuordnung und kann den Konflikt nicht über einen ungeprüften Schalter umgehen.

Betroffen: Matrix §7, `dev/verify_postrelease.py`, CI/Tag-/Image-Workflow,
Release-Anleitung und [ADR 0008](0008-mimir-naming-installation.md).
Keine Skript-/Tag-/Release-Änderung in A1.
