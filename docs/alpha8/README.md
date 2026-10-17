# Alpha 8 — Mimir

Basis main@a08a51d716d0ee8fd435ae3837735db3d36e2c91 (Terra 1.0.0a7.post1).
Benni, 17.10.2026; ein Branch agent/codex-alpha8-mimir, ein
[PR #25](https://github.com/levtos/core_contract_app/pull/25), eigene Block-Commits.
Quellen: [#24](https://github.com/levtos/core_contract_app/issues/24),
[#23](https://github.com/levtos/core_contract_app/issues/23),
[Matrix](../audits/akte-gap-2026-10.md) von audit/akte-gap@95cd47b.

Claude hat A1 freigegeben. Alle fünf von Benni übermittelten Auflagen gelten
ohne neue Designrunde. A2 endet nach den Nachweisen mit **STOPP für Review**.
[Plattformformate](platform.md), [Aufbewahrung/Skalierung](retention-scaling.md),
[Abnahme](ABNAHME.md).

| Entscheidung | ADR | Stand |
|---|---|---|
| G17 HA-Freshness/Connectivity | [0005](../adr/0005-ha-outage-connectivity.md) | freigegeben, A2 |
| G19 Instanzparameter | [0006](../adr/0006-instance-parameters.md) | Variante A, freigegeben, A2 |
| G4 Hybrid | [0007](../adr/0007-hybrid-catalog-decision.md) | Variante 3 beschlossen, Bau Alpha 10 |
| Mimir/Bifröst, neue Installation | [0008](../adr/0008-mimir-naming-installation.md) | freigegeben; Repo-Owner-Aktion offen |
| Versionsschema | [0009](../adr/0009-prerelease-version-gate.md) | Monotonie je aus jedem Tag gelesener Supervisor-Slug-Linie |
| G1 lokale Uhr/Kalender | [0010](../adr/0010-clock-calendar-inputs.md) | freigegeben mit minute_of_day/day_of_year, Minutenstandard und DST |
| G13 n Klassen | [0011](../adr/0011-multiclass-bucket.md) | freigegeben mit Pflicht-initial/dynamischen Grenzen |
| Neue DB/Rolle | [Runbook](../operations/mimir-new-database.md) | vorbereitet, nicht ausgeführt |

A2 umfasst außerdem G18, G3, G5/G6, G14, F1/F2 und die vier UX-Reste aus #23.
Die Matrix bleibt Audit-Historie; Bennis Entscheidungen ersetzen ihre Gates
nur im beauftragten Umfang. Ein gemeinsamer PR ersetzt hier „je Lücke ein PR“.
Keine privaten Akte-Dateien oder Bestandsdaten.

**Nicht Alpha 8:** G2/G7/G8/G9/G10/G12/G15/G16 → Alpha 9. G4 und Kategorien,
Raum, Import & Export, Seitenregel → Alpha 10. G20 nur geprüft; kein neuer
Event-Kanal. Keine Domain-Portierung oder Consumer-Migration.

**Teil B nur nach Bennis Go:** Repo Levtos/mimir, v1.0.0a8, Pre-Release,
beide Images mit Digests, vollständiges Versionsgate, neue DB/Rolle nach
Runbook, neue Mimir-App, Bifröst via HACS, Start/Ingress/Verbindung nachweisen.
Supervisor-Repo-Weiterleitung prüfen, sonst neue URL ergänzen; Terra-Eintrag
erhalten. Terra, alte Bridge und Legacy benni_core_contracts v0.2.4 bleiben.

Die tatsächliche Repo-Umbenennung benötigt Owner/Admin. levtos-codex hat Push-,
aber keine Admin-/Maintain-Rechte; Quellumstellung ist im PR vorbereitet.
GitHub-Weiterleitung und reale HACS-/Supervisor-Installation sind noch nicht
als Ist-Zustand belegt. Letzter Reset vor Beta später per DB-Runbook.
