# Alpha 8 — Mimir: Entscheidungen und Design-Review

Stand: 17.10.2026. Basis `main@a08a51d716d0ee8fd435ae3837735db3d36e2c91`
(Terra `1.0.0a7.post1`). Auftrag Benni; Umsetzungsagent `agent:codex`.
Ein Branch `agent/codex-alpha8-mimir`, ein gemeinsamer PR, getrennte Block-Commits.
**Teil 0/A1: nur Dokumentation. A1 endet vor dem Bau für Claude-Review.**

Verbindliche Quellen: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[#23](https://github.com/Levtos/core_contract_app/issues/23),
[Audit-Matrix](../audits/akte-gap-2026-10.md) aus `audit/akte-gap@95cd47b`,
Build-Spezifikation, ADR 0002/0003 und Bennis Fortschreibung vom 17.10.2026.
Die Matrix ist unverändert übernommene Audit-Basis. Ihre offenen Gates,
Versionsoptionen und „je Lücke ein PR“ sind durch den aktuellen Auftrag nur im
hier ausdrücklich beschriebenen Umfang fortgeschrieben; der Rest bleibt Quelle.
Keine privaten Akte-Dateien oder Bestandsdaten werden veröffentlicht.

## Review-Einstieg

| Block | Dokument | Status |
|---|---|---|
| G17 | [ADR 0005: HA-Ausfall/Connectivity](../adr/0005-ha-outage-connectivity.md) | Produktentscheidung beschlossen; Design im Review |
| G19 | [ADR 0006: Instanzparameter](../adr/0006-instance-parameters.md) | Variante A beschlossen; Design im Review |
| G4 | [ADR 0007: Hybrid-Katalog](../adr/0007-hybrid-catalog-decision.md) | Variante 3 beschlossen; Bau Alpha 10 |
| Mimir | [ADR 0008: Umbenennungen und Installation](../adr/0008-mimir-naming-installation.md) | neuer Slug/Version beschlossen; Design im Review |
| Versionen | [ADR 0009: Vorabversionen/Tag-Gate](../adr/0009-prerelease-version-gate.md) | Suffixregel beschlossen; Vergleichsregel offen |
| G1 | [ADR 0010: Uhrzeit/Kalender](../adr/0010-clock-calendar-inputs.md) | Design im Review |
| G13 | [ADR 0011: n-Klassen-Bucket](../adr/0011-multiclass-bucket.md) | Design im Review |
| Datenbank | [Vorbereitetes Runbook](../operations/mimir-new-database.md) | nur Plan, nichts ausgeführt |

Die JSON-Ausschnitte sind Formatvorschläge, keine heute importierbaren Registries.
Review-Schwerpunkte: Ereignisplanung/DST/Restart; Bucket-Grenzen, initial unknown
und Legacy-Kompatibilität; Parameter-Slots/Fingerprint/Cache-Isolation;
Beobachtungslücke gegenüber HA-Evidence; Parallelbetrieb beider Bridge-Domains;
explizite Sprach-/API-Kompatibilität. Kein neuer Interpreter oder zweiter Processor.

## Festgehaltener weiterer Auftrag (keine Freigabe durch dieses Dokument)

**A2 erst nach Review-Freigabe:** Mimir-Umstellung und `docs/naming.md`; G18
Scope-Sperren bewusst mit Tests lösen; G17/G19/G1/G13 gemäß freigegebenen ADRs;
G3 geschlossene Text-Operatoren; G5 `active → deprecated → retired`; G6 Formeln
mit benannten typisierten Eingängen, `quantity`, `required`, `category`,
gemischten Einheiten; G14 eigene Vollständigkeitsachse mit gültigen Werten und
Hinweisen, getrennt von „Signal gestört“; F1/F2; die vier UX-Reste aus #23.

F1/F2 bleiben vollständig: referenzbewusste Messwert-/Evidence-Aufbewahrung und
Verdichtung samt Verhalten alter Evidence-Referenzen, Index-/Migrations-/Restore-
Nachweis sowie Messung von Speicher und P95-Latenz bei 100k/1M und geplantem
Horizont; zusätzlich verbleibende Vollgraphkosten unter geplanter Quellrate und
Graphgröße messen. Optimierung nur mit Äquivalenztests für Commands, Freshness,
Deadlines, Recovery und atomare Publication. Aufbewahrung allein schließt F2
nicht. Speicher-/Latenzbudgets müssen vor Produktion konkret feststehen.
Siehe [bestehenden F1/F2-Auftrag](../alpha4/opus-review-corrections.md).

#23 bleibt: „Akteur“/„Semantik“ verständlich ersetzen; Ja/Nein-Stufe bis jetzt
fortführen bei korrekten Lücken/unknown; Typsperre mit Quellenname. Deutsch,
Du-Form, ohne App-Vorwissen bedienbar; vorhandener Frontend-/Designsystemvertrag.

**Nicht Alpha 8:** G2/G7/G8/G9/G10/G12/G15/G16 → Alpha 9;
G4 sowie Kategorien/Raum/Import & Export/Seitenregel → Alpha 10. G20 nur prüfen.
Keine Domain-Contract-Portierung, Policy/Apply oder Consumer-Migration.

**A2-Nachweise:** grüne vollständige CI, Tests je Block, i18n-Scan ohne harte
UI-Texte; Firefox 1568×710 ausschließlich neue/geänderte Flächen (Vertragsparameter,
Vollständigkeitshinweis, Übersicht, Mimir-Kopf); kurze `ABNAHME.md` Block → Nachweis.
Diese Nachweise sind jetzt **offen**; Dokumentationschecks sind kein Ersatz.
Danach erneut STOPP, kein Merge-/Release-/Installationsautomatismus.

**B erst nach Bennis „Go“:** Repo `Levtos/mimir`, Tag `v1.0.0a8`, Pre-Release,
beide Architektur-Images mit Digests, Versionsgate; neue DB/Rolle nach Runbook mit
Ergebnisprotokoll, neue Mimir-App und Bifröst via HACS; Version/Startlog/Ingress/
Bridge nachweisen und stoppen. Terra, alte Bridge und Legacy v0.2.4 bleiben
unverändert installiert. Keine dieser Aktionen ist in A1 ausgeführt.

## Offener Punkt vor Teil B

AwesomeVersion bewertet `1.0.0a8 > 1.0.0a7.post1` als false. Der neue Slug
ändert den Installationspfad, nicht die historische Tag-Reihenfolge. ADR 0009
legt dies offen; eine Prüfung „neuer als alle historischen Tags“ darf unter
diesen Vorgaben noch keinen grünen Release-Nachweis melden. Keine stillschweigende
Linien-Ausnahme oder Umnummerierung. Produktentscheidung zur genauen Regel bleibt Benni.
