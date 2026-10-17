# ADR 0008 — Mimir, Bifröst und neue Installation

Datum: 17.10.2026. **Benni beschließt neuen Slug jetzt in Alpha 8, erste Version
`1.0.0a8`**. Technische Umstellung: Vorschlag für Claude-Review, Umsetzung erst A2.
Bezug: [#24](https://github.com/Levtos/core_contract_app/issues/24),
[#23](https://github.com/Levtos/core_contract_app/issues/23), APP-01,
[Profil-Delta-Audit](../audits/profile-delta-audit-2026-10-07.md).

## Ziel und vollständiger Umbenennungsumfang

| Oberfläche/Identität | Terra-Basis | Alpha-8-Ziel |
|---|---|---|
| GitHub-Repository | `Levtos/core_contract_app` | `Levtos/mimir`, GitHub-Weiterleitung prüfen |
| App-Verzeichnis | `core_contracts/` | `mimir/` |
| App-Name / Panel / UI-Kopf / Browser-Titel | Terra / Core Contracts | Mimir |
| Supervisor-Slug | `core_contracts` | `mimir` (Neuinstallation) |
| App-/Projekt-URL, Repository-Metadaten | altes Repository | `https://github.com/Levtos/mimir` |
| Architektur-Images | `ghcr.io/levtos/{arch}-core-contracts` | `ghcr.io/levtos/{arch}-mimir` |
| HA-Bridge-Anzeigename | Core Contracts Bridge | Bifröst |
| HA-Domain / Komponentenpfad | `core_contracts_bridge` | `bifrost` / `custom_components/bifrost/` |
| HA-WS-Kommando-Präfix / Event-Bezüge | `core_contracts_bridge/*` | `bifrost/*`, in App, Fake-HA und Tests gemeinsam |
| HACS-Metadaten / Manifest / Übersetzungen | alte Bridge / Repo-URL | Bifröst / neue Repo-URL / Domain `bifrost` |
| Betriebs-/Build-Verweise | alter App-/Bridge-Pfad | neue Pfade in CI, Staging, Packaging, Smoke, Release-Doku |
| Setup / Konfigurationsfluss / Diagnose | Terra / alte Domain | Mimir / Bifröst, eigene neue Config-Entry |
| Version in App, Paket, Frontend, Bridge | `1.0.0a7.post1` | synchron `1.0.0a8`, erst A2/B gemäß Gate |

Python-Importpakete `core_contracts` und `core_contracts_client`, Distribution-
Identitäten, öffentliche `CoreContractsClient`-Klasse, `/api/v1`, DB-Tabellen
`cc_*`, Registry- und Contract-IDs sind technische Schnittstellen und werden
**nicht automatisch umbenannt**. „Core Contracts“ bleibt fachlicher Begriff.
Begründung: Produktname ist keine neue Contract-Semantik. Protokollnummern werden
nur bei realer Inkompatibilität geändert. Die neue Bridge-Domain ist eine neue
Installation, keine automatische Migration alter Config-Entries oder Unique-IDs.

Vor dem A2-Commit: vollständiger Suchabgleich aller aktuellen Namensfundstellen
(App, Backend, Frontend, HACS, WS, CI, Images, Fixtures, Runbooks). Historische
Release-/Audit-Belege behalten damalige Namen. Aktive Anleitungen verweisen auf
Mimir/Bifröst. Neue und geänderte UI-Texte durchgehend Deutsch, Du-Form,
verständliche Bezeichnungen; technische IDs nur in Diagnoseflächen.

## Installation und Parallelbetrieb

Mimir erhält neue Supervisor-Identität, leeres eigenes `/data`, neue
`installation_id`, eigene PostgreSQL-DB und Rolle, eigene Secrets und Tokens.
Kein Kopieren von Terras `/data`, keine Übernahme ihrer DB, keine Adoption ihrer ID.
Der [Datenbankplan](../operations/mimir-new-database.md) bereitet den benannten
Betriebsauftrag vor; A1 führt nichts aus. Letzter Reset vor Beta erfolgt später
per eigenem Datenbank-Runbook, **nicht** per weiterer Neuinstallation/Slugwechsel.

Terra und die alte Bridge bleiben installiert, bis Benni Mimir abnimmt; die
Legacy-Integration `benni_core_contracts` v0.2.4 bleibt unverändert. Mimir spricht
ausschließlich mit `bifrost/*`, Terra weiter mit der alten Bridge. Kein automatischer
Consumer-Cutover. Beide Apps haben isolierte Writer/DBs. GitHub-Repo-Weiterleitung
ersetzt keinen Supervisor-Slug, HACS-Installationspfad oder GHCR-Image-Pfad.
Vor Umbenennung sind bestehende Terra-Image-Tags und alte Release-Assets zu
inventarisieren und ihre unveränderte Abrufbarkeit zu prüfen.

Die spätere `docs/naming.md` enthält: Mimir = Core Contracts (App), Bifröst =
HA-Bridge, Yggdrasil = Proxmox-Anzeigename (Hostname `einhornstation` bleibt),
Midgard = HA Benni, Vanaheim = HA Eltern mit **eigener** Mimir-Installation,
Heimdall = Anwesenheit, Frey = Klima, Sol = Licht/Rollos, Mani = Schlaf/Wecken,
Bragi = Media; Reserve Hugin, Munin, Sleipnir, Odin. Keine Core-Profile.
Producer liefern Wahrheit ein, Policies handeln; Namen vereinigen diese Rollen nicht.

## Tests und Grenzen

Geplant: Packaging beider Architekturen; öffentliche Image-Pulls/Digests;
Slug-/Pfad-/Namenskonsistenz; Bifröst-Config-Flow und WS-Test; isolierter Test
beider Bridge-Domains ohne Doppelregistrierung; neue Installation-ID und
DB-Zieltrennung; keine Umleitung der Terra-App; Ingress-Titel und Firefox-Bild
1568×710. GitHub-Weiterleitung, HACS-Auffindbarkeit, DB/TLS, realer Start und
Ingress werden erst nach Bennis Teil-B-Go belegt. Keine Abschaltung alter Apps.

Betroffene Akte: APP-01/Installationsisolation, Profil-Delta-Audit; Build-Spezifikation
§11, §13–§15, §23–§25; Manifest/Packaging/CI/Setup/UI/Betriebsdoku.
Die Versionsvergleichsfrage bleibt ausdrücklich in [ADR 0009](0009-prerelease-version-gate.md).
