# Wiederverwendungsanalyse (§4 des Build-Auftrags)

Basis: neues `main` bei `4885320ad81927a9afd6bcbb69079519bd6849ba`.
Legacy wurde ausschließlich gelesen, einschließlich `core-contracts#46` und seines
Superseded-Kommentars. Der lokale Legacy-Stand ist `5160aef2`; kein lokaler oder
Remote-Branch `agent/alpha1-build` und keine `src/core_contracts`-Reste wurden in den
geprüften Workspace-Verzeichnissen gefunden. Es gibt daher keinen früheren
App-Build, der pauschal übernommen oder verworfen werden könnte.

| Bestandteil / Herkunft | Kategorie | Entscheidung |
|---|---|---|
| Graph: Zyklusprüfung und eindeutige Producer (`graph.py`) | ADAPT | Prinzip behalten, explizite Typ- und Input-Registry; keine Domain-Zweige |
| Quality/Freshness (`quality.py`, `TemporalEvidence`) | ADAPT | Quellzeit/Empfangszeit trennen; fünf Status, Reason-Pflicht, deklarierte Grace; alte Fallback- und Default-Cadence-Regeln entfallen |
| Generische Fusion (`graph.py`) | ADAPT | Dreiwertige Strategien, Evidence und Held-Ende; keine `opening_*`-Strategien |
| Revision/OCC, kanonisches JSON/SHA-256 (`registry.py`, `registry_store.py`) | ADAPT | Mechanismen neu an installation-lokale Revisionen, persistierte Drafts und einzige Writer-Verbindung anbinden |
| Import-Validierung (`registry_transfer.py`) | ADAPT | Rekursive Secret-/URL-Abwehr und Größenlimit behalten; neues Schema ohne Legacy-Kontext |
| HA-Normalisierung (`source_listener.py`) | ADAPT | Reine Zeitstempel-/Wertübertragung; kein implizites UTC für naive Zeiten, keine Domain-Mappings; Bridge statt HA-internem Runtime-Aufruf |
| Frontend-Toolchain (`frontend/package.json`) | KEEP / ADAPT | Svelte 5, Vite, TypeScript, Bits UI, Tailwind, Lucide; neue HTTP-API und Admin-Funktionen |
| Generische Tests (`tests/`) | ADAPT | Testideen für Zyklen, OCC, Zeitstempel und Freshness; neue synthetische Fixtures statt Domain-/HA-Runtime-Fixtures |
| `profiles.py`, ProfileId, Default-Kontext | REMOVE/REVERT FROM ALPHA1 | Verbotene Core-Dimension |
| `shadow*`, `published.py`, Gate-Module | REMOVE/REVERT FROM ALPHA1 | Ein aktiver Pfad mit enabled; kein paralleler Betriebsmodus |
| `consumer_ids`, `hass.data`-API, HA-Store, ConfigEntry-Lifecycle der Legacy-Plattform | REMOVE/REVERT FROM ALPHA1 | Consumer-Grenze HTTP/WS; Persistenz ausschließlich PostgreSQL |
| Legacy v1-Schemas und Domain-Fusion | REMOVE/REVERT FROM ALPHA1 | Produktive Domain-Contracts gehören zu Phase 2 |
| Legacy SQL-Migrationen und private asyncpg-Anpassungen | REVIEW | Nicht übernehmen: inkompatibles Schema/Lifecycle; ausschließlich öffentliche asyncpg-API |
| Legacy UI-Seiten/Stores | REVIEW | Nicht direkt übernehmen: alte Profil-/Gate-/Consumer-Semantik; nur Toolchain wiederverwenden |

ADAPT bezeichnet die nachgewiesene Wiederverwendung generischer Mechanismen, keine
ungeprüfte Dateikopie. Die neue Plattform importiert weder Legacy-Pakete noch
Consumer-Code. Änderungen, Commits und Releases im Legacy-Repository sind nicht
Teil dieses Auftrags.
