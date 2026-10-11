# ADR 0002 — Phase 1A Producer-Kit, Ownership, Typen, Commands und Readiness

Status: beschlossen durch Benni, 11.10.2026. Umsetzung: [Issue #10](https://github.com/Levtos/core_contract_app/issues/10).
Ergänzt die [Build-Spezifikation](../platform-alpha1/build-specification.md), keine Phase-2-Freigabe.

- **E1:** Core Contracts ist die kanonische Plattform für beobachtete und deterministisch
  abgeleitete Zustände einschließlich fachlicher Zielwerte. Spätere Module konsumieren
  Contracts, führen reale Geräteaktionen aus und melden Feedback als Sources zurück.
  Keine Aktorik oder produktive Domain-Policy im Core dieses Phase-1A-Builds.
- **E2:** `TypeRegistry` ist ein interner Registrierungsmechanismus für code-definierte,
  versionierte Typen. Erweiterbarkeit ist keine Zulassung: Die App lädt weiterhin nur
  synthetische `test.*`-Typen mit `fixture=true`. Kein `core.*`-Katalog, keine externen
  Plugins, keine Domain-Typen. G13 prüft die tatsächlich von der App geladene Registry.
- **E3:** Ein Command kann am Typ ein geschlossenes Pydantic-Argumentmodell deklarieren.
  Validierung ist strikt (keine String→Bool-Coercion); fehlende/zusätzliche/falsch typisierte
  Argumente führen zu `rejected/invalid_value`. Transition-Guards bleiben zuständig.
  Typversion 1 behält parameterloses `request_b`; `test.state_machine` Version 2 ergänzt
  synthetisches `request_b_if {confirm: bool}`. Kein `set_state` und keine freien Mutationen.
  Idempotenz prüft weiterhin zuerst den Hash des vollständigen ursprünglichen Envelopes;
  Validierung/Defaults verändern diesen Schlüssel nicht. Revision-Konflikte heißen
  `active_revision_conflict`. Wirkung, Originalcommand und Antwort werden atomar persistiert.
- **E4:** HA-Snapshot ist nur für HA-Quellen erforderlich, die aktive Contracts tatsächlich
  benötigen; Source-Monitore und Liveness-Quellen gehören dazu. MQTT-only benötigt keinen
  HA-Snapshot. Keine aktive Registry oder DB-/Lock-Ausfall bleiben Readiness-Blocker.
  Nach dem ersten erforderlichen Snapshot ist HA-Verlust ein Dependency-/Quality-Problem,
  kein Liveness-/Watchdog-Fehler. Es gibt keinen Timeout, der fehlende Evidence als ready erklärt.

## Producer-Kit und Feldgrenze

`producer.Producer` nimmt eine code-definierte Feldfunktion (`Context → dict[str, FieldValue]`)
auf. `Context` enthält Clock, staged Node-/Latch-State, Inputs, Revision und Auslöser.
Generische Temporal-Restore-/Grace-/Edge-/Age- und State-Machine-Restore-/Re-Init-/Deadline-
Orchestrierung liegen in `producer.py`; die synthetischen Typen liefern nur ihre Operator-,
Feld-, Guard- und Re-Init-Definitionen. Die Runtime kennt keine `test.*`-IDs.

`init` wird pro Prozess/Epoche beziehungsweise neuem Semantik-Kontext aufgerufen; `dispose`
bei Disable, Entfernung, Semantikwechsel und geordnetem Stop. Hooks sind rein, synchron,
ohne I/O: Mutation nur im staged Context. Sie dürfen bei einem Commit-Retry erneut laufen.
Producer-Exceptions verwerfen begonnenen Node-/Latch-/Refresh-State und publizieren
`evaluation_error` je deklariertem Feld. Latches bleiben ausschließlich flüchtig.

Das bestehende JSON-Envelope bleibt erhalten. Einzelne frühere Callbacks mit einem
FieldValue werden kompatibel auf `value` abgebildet. Jedes deklarierte Feld wird geprüft;
fehlende Felder erhalten `config_incomplete`, falsche Werte `invalid_value` ohne Ersatz.
Boolean ist keine Number; Numbers sind endlich; Enum/Text-Kataloge werden durchgesetzt.
Physische Zustände bekommen keinen Fallback oder hold-last. Eigene Grace benötigt eine
Schema-/Parameterdeklaration; ererbtes Held behält die ursprüngliche Frist.
`contract_health` verwendet ausschließlich Pflichtfelder, `available` ausschließlich die
deklarierten Projektionsfelder. Ein optionales unbekanntes Feld vergiftet keine Pflichtfelder.

## Dependency und Refresh

`monitor=internal` beobachtet HA-/MQTT-Transportstatus. `monitor=source` benötigt eine
explizite `source_id`: tragfähiges gesundes Bool `true` bedeutet verfügbar, alles andere
`dependency_unavailable`. Selbstreferenzen, Monitorzyklen, ungebundene Monitore und
unimplementierte interne `other`-Monitore werden abgelehnt. Monitoring erzeugt keine
fachlichen Connectivity-Contracts. Fingerprints berücksichtigen Source-Monitor-Abhängigkeiten.
Der bislang nur deklarierte Source-Adapter `scheduler` wird abgelehnt; der interne
Deadline-/Temporal-Scheduler bleibt unverändert nutzbar.

Ein Producer kann `Context.request_refresh(input_name)` aufrufen, wenn der Typ dieses
HA-Source-Input in `refresh_inputs` deklariert. Die Runtime dispatcht erst nach Commit
an eine begrenzte Queue; ein separater Adapter-Worker ruft ausschließlich
`homeassistant.update_entity` auf. Keine Geräteaktion, kein generischer Serviceaufruf.
Alte Revisionsanforderungen werden verworfen, Fehler/Overflow diagnostiziert, keine
persistierte Wiederholung nach Restart. `test.echo` v2 beweist eine einmalige Anforderung
pro negativer Evidence-Phase und verhindert eine Refresh-Schleife.

## Kompatibilität und Grenzen

Installation-ID, DB-Schema, API-Protokoll und vorhandene Typversionen bleiben erhalten.
Neue Command-/Refresh-Fähigkeiten haben eigene synthetische Typversionen; bestehende
v1-Typbeschreibungen erhalten keine leeren neuen Fingerprint-Felder. Kein automatisches
Registry-Upgrade. Ungültige bestehende Supervisor-Optionen sperren DB-Start und Wizard-
Schreibaktionen; Health und eine verständliche Fehleranzeige bleiben erreichbar.

P2 (mehrere SM-Deadlines, Session-Endregeln, Delta-Optimierung, DB-Probe-Intervall) bleibt
vertagt. Technische CI und echte HA-Abnahme sind getrennte Gates. Merge/Release folgen
erst nach Opus-Delta-Review und Freigabe; Live benötigt eine weitere Freigabe.
