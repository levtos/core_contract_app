# Namen und Zuständigkeiten

| Name | Aufgabe |
|---|---|
| Mimir | Core Contracts, eigenständige App |
| Bifröst | HA-Bridge, reiner Transport, Domain `bifrost` |
| Yggdrasil | Proxmox-Anzeigename; Hostname `einhornstation` bleibt |
| Midgard | Home Assistant Benni |
| Vanaheim | Home Assistant Eltern, eigene Mimir-Installation, eigene DB/Rolle/ID/Tokens |
| Heimdall | Anwesenheit |
| Frey | Klima |
| Sol | Licht und Rollos |
| Mani | Schlafen und Wecken |
| Bragi | Medien |
| Hugin, Munin, Sleipnir, Odin | Reserve |

Producer liefern Zustände und Evidence ein. Policies entscheiden Handlungen;
Apply führt sie aus. Diese Rollen bleiben getrennt. Mimir hat keine Core-Profile
(APP-01 und [Profil-Delta-Audit](audits/profile-delta-audit-2026-10-07.md)).
Technische Python-Importnamen und Contract-IDs bleiben stabil.

Die neue App liegt unter `mimir/`, Slug `mimir`, Images
`ghcr.io/levtos/{arch}-mimir`. `core_contracts/config.yaml` bleibt als unveränderter
Terra-App-Store-Eintrag erhalten; neue Builds und Veröffentlichungen betreffen Mimir.
Terra, alte Bridge und Legacy bleiben bis zu Bennis Abnahme installiert.
Installation, Supervisor-Weiterleitung und gegebenenfalls Ergänzung der neuen
Repo-URL im Store werden erst in Teil B geprüft, ohne den Terra-Eintrag zu entfernen.
