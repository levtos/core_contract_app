# Technische Auslegungen und Abweichungen

Keine fachliche Contract-Entscheidung wurde geändert. Phase 2 bleibt ausgeschlossen.

1. **Lokales Supervisor-Build-Kontext (§14):** Der vorgeschriebene Monorepo-Aufbau
   hält `src/`, Migrationen und Frontend außerhalb des App-Unterordners. Supervisor
   baut einen lokalen App-Unterordner als Kontext. `dev/stage_app.py` erzeugt deshalb
   ein separates, vollständiges lokales App-Repository. Im Git-Repository werden
   keine doppelten Quelltexte gepflegt. CI baut denselben Dockerfile vom Repo-Root.
   Die Staging-Konfiguration entfernt nur die vorgebaute Image-Referenz. Es wird
   kein Image veröffentlicht und kein reales Supervisor-System verändert.
2. **Frontend-Testwerkzeug (§25):** Die Legacy-Vitest-Version wurde nicht übernommen,
   da der Paket-Audit bekannte Schwachstellen auswies. Vitest 5.0.3 ist im Lockfile
   festgehalten; der Svelte/Vite/TypeScript-Stack bleibt erhalten.
3. **Lexikalischer Scope-Selbstcheck (§8 des Prompts):** Die ebenfalls vorgeschriebenen
   API-Felder `published_at`, das Clock-Interface `sleep`, Transport-Retry-Aufrufe,
   CSS-`@media`, das Lucide-Icon `Activity`, PostgreSQLs `pg_stat_activity` und fremde
   Paket-Metadaten in Lockfiles enthalten Wörter der Suchliste. Diese sind generische Plattform-/Transportbegriffe,
   keine Domain-Contracts. Die verpflichtende Volltextsuche wird deshalb zusammen mit
   dem Typ-Registry- und AST-Scope-Test bewertet. Diese unvermeidlichen API-/Clock-Namen
   werden nicht umbenannt. Verbotene Registry-Felder werden durch geschlossene Modelle
   abgewiesen; nur die negativen Validierungstests nennen sie im Code.
4. **Alpha-Speicherung (§12):** Generische Tabellen speichern typisierte Envelopes bzw.
   Kontext als JSONB unter stabilen Schlüsseln; Publication-Zeit ist `timestamptz`.
   Der Writer schreibt ausschließlich geänderte Zeilen in einer Transaktion. Der
   konsistente Lesestand liegt im Prozessspeicher. History-Retention und Partitionierung
   bleiben wie §30 vertagt; sehr große Historien sind kein Alpha-Lastziel.

Nicht ausgeführte Supervisor-/HA-Checks sind offene Nachweise, keine Ersatzsemantik.
Der genaue Stand steht im Abschlussbericht und in `build-time-verification.md`.
