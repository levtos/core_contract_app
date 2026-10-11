# Technische Auslegungen und Abweichungen

Ownership wurde am 11.10.2026 durch Benni als E1 präzisiert; E1–E4 sind in
[ADR 0002](../adr/0002-phase1a-producer-and-ownership.md) verbindlich dokumentiert.
Keine fachlichen Contract-Typen wurden implementiert. Phase 2 bleibt ausgeschlossen.

1. **Lokales Supervisor-Build-Kontext (§14):** Der vorgeschriebene Monorepo-Aufbau
   hält `src/`, Migrationen und Frontend außerhalb des App-Unterordners. Supervisor
   baut einen lokalen App-Unterordner als Kontext. `dev/stage_app.py` erzeugt deshalb
   ein separates, vollständiges lokales App-Repository. Im Git-Repository werden
   keine doppelten Quelltexte gepflegt. CI baut denselben Dockerfile vom Repo-Root.
   Die Staging-Konfiguration entfernt nur die vorgebaute Image-Referenz. Es wird
   kein reales Supervisor-System verändert. Seit Alpha a1/a2 existiert zusätzlich der
   explizit gestartete GHCR-Veröffentlichungsworkflow; normale PR-CI veröffentlicht nicht.
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

5. **Scheduler:** Der interne 0,5-s-Tick prüft `next_due` und Clock-Sprünge. Persistente
   Fristen bleiben UTC-absolut; statt eines `call_at_utc` pro Knoten erfolgt begrenztes
   Polling. Das ist funktional getestet, keine Behauptung einer Echtzeitgarantie.
   Der separate Source-Adapter `scheduler` wird explizit abgelehnt statt scheinbar unterstützt.
6. **Fusion:** Input-Reihenfolge ist die Priorität von `first_healthy`; `latest` entscheidet
   nach Messzeit und meldet bei gleicher Messzeit mit widersprüchlichen Werten `conflict`.
   Andere Strategien haben eigene Regeln; es gibt keinen zusätzlichen globalen Konfliktheuristiker.
7. **MQTT-Zeit:** Ohne `mqtt_time_path` fehlt Messzeit, daher `input_stale`. Empfangszeit ist
   niemals ein Ersatz. Retain/QoS-Duplikate erzeugen ebenfalls keine frische Evidence.
8. **SM-Umfang:** Eine Deadline pro Instanz/Episode; mehrere Fristen und Session-End-/Neustartregeln
   bleiben P2. Generische Restore-/Deadline-/Re-Init-Orchestrierung ist dagegen Bestandteil
   des Plattform-Kits und nicht mehr Fixture-Aufgabe.
9. **Snapshot-Warten:** Es gibt keinen Timeout, der eine benötigte, aber fehlende HA-Snapshot-
   Evidence freigibt. Die App bleibt live/diagnostizierbar und nicht ready. Nach E4 warten
   MQTT-only-Registries und unbenutzte HA-Bindings nicht auf die Bridge.
10. **Lifecycle/Refresh:** Producer-Hooks sind reine staged Berechnung, keine I/O-Ressourcen-
    Hooks. Refresh ist eine begrenzte Best-effort-Anforderung nach Commit, keine durable
    Outbox und keine Wiederholung nach Restart; Fehler/Overflow werden diagnostiziert.

Historische Mehrfeld-/Producer-Kit-Lücken sind **keine** vertagten Alpha-Limits mehr;
Nachweise stehen in [phase1a-completion.md](phase1a-completion.md).
