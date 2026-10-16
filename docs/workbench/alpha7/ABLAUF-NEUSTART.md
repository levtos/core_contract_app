# Alpha 7 – Administrativer Ablauf-Neustart (P9)

Verbindlich: [ADR 0004](../../adr/0004-manual-machine-restart.md), angenommen durch
Bennis Alpha-7-Auftrag in [Issue #19](https://github.com/levtos/core_contract_app/issues/19).
Die automatische, datenbasierte Wiederherstellung aus Alpha 6 bleibt der Standard.

## Bedienung und Freigabe

Im Ablauf-Editor ist **Administratoren dürfen diesen Ablauf manuell neu starten**
standardmäßig ausgeschaltet. Eine schon übernommene Vorlagenversion bleibt
unveränderlich; die Freigabe benötigt eine neue Version und die gewöhnliche
Übernahme des Entwurfs. Ein ungeprüfter Entwurf kann keine Freigabe erteilen.

Auf der Vertragsseite und unter **Experten-Diagnose → Befehle** steht
**Ablauf neu starten**. Ohne Freigabe ist die Aktion deaktiviert und der Grund
sichtbar. Ein berechtigter Neustart zeigt den festgelegten Startzustand, die
Konfigurationsversion, direkt und transitiv betroffene Verträge sowie den Hinweis,
dass externe Automationen nicht vollständig bekannt sind. Eine Begründung und
die ausdrückliche Bestätigung „Der Startzustand wird manuell gesetzt und ist nicht
durch Sensordaten bestätigt“ sind erforderlich.

Eine Änderung an Version oder Ablauf seit der Vorschau verlangt eine neue
Bestätigung. Beim Verlust der Antwort kann ausschließlich das gespeicherte
Ergebnis derselben Befehlskennung abgefragt werden; es gibt keine automatische
erneute Ausführung. Ein Wechsel des Vertrags oder das Schließen der Ansicht
während der Serverzeit-Abfrage verhindert einen danach verspätet gesendeten
Neustart.

## API und Transaktion

Beide Endpunkte benötigen serverseitig authentifizierte Administratorrechte:

- `GET /api/v1/manual-restarts/preview/{contract_id}`: Freigabe, Startzustand,
  vorherige Episode, statische Auswirkungen, Version, Zustandsprüfwert und
  Serverzeit; keine Zustandsänderung.
- `POST /api/v1/manual-restarts`: `command_id`, `contract_id`, `reason`, `confirm`,
  `issued_at`, `valid_until`, `expected_registry_revision`, `expected_state_token`.
  Es gibt kein frei wählbares Ziel, keine Sensorwerte und kein Identitätsfeld.
  Zusätzliche Felder werden zurückgewiesen. Der Administrator-Akteur wird aus
  dem geprüften Ingress-Peer beziehungsweise der authentifizierten Tokenrolle
  übernommen; Client-Header können ihn nicht ersetzen.

Die Wirkung setzt ausschließlich den deklarierten Startzustand und beginnt eine
neue Episode. Aktueller Zustand, alte/neue Episode, Befehlsresultat und Audit mit
Zeitpunkt, Grund und Akteur werden in derselben bestehenden Transaktion
gespeichert. Erst nach erfolgreichem Commit werden Envelope/WebSocket sichtbar.
Eine fehlgeschlagene Produzentenauswertung verwirft die vorgeschlagene Wirkung;
ein Commitfehler veröffentlicht keinen neuen Vertragszustand.

Neustarts teilen den dauerhaften Idempotenzraum `command_log` mit den normalen
Befehlen. Gleiche Kennung und gleicher Inhalt liefern das gespeicherte Resultat,
auch nach Restore. Abweichender Inhalt derselben Kennung liefert einen Konflikt.
Restore führt keinen Neustart erneut aus.

## Datenbestätigung und Verbraucher

`state_machine.manual_restart=true` und der Feldgrund `manual_restart` markieren
die manuelle Behauptung. Der Vertrag hat bis zur Datenbestätigung eingeschränkte
Qualität und gilt nicht als verfügbarer gesunder Sensornachweis. Die Oberfläche
zeigt **Manuell gestartet** und erklärt den Zustand in Alltagssprache.

Die Markierung bleibt bei normalen Befehlen, Fristen, konstanten Regeln,
ungültigen/restaurierten Messwerten und Runtime-Restore erhalten. Sie endet bei:

- einem Eingangsübergang, dessen entscheidende Bedingung einen gültigen,
  gesunden Sensornachweis hat; oder
- einer erfüllten deklarierten Wiederherstellungsbedingung mit solchem Nachweis.
  Dieser Fall beginnt eine automatische Episode im deklarierten Startzustand.

Historie und Diagnose behalten den Unterschied zwischen manueller Anfrage,
manuell behauptetem Zustand und späterer automatischer Bestätigung. Externe
Automationen müssen weiterhin ihre eigenen Qualitäts- und Verfügbarkeitsregeln
beachten; Terra behauptet keine vollständige Kenntnis externer Verbraucher.

## Nachweise und Grenzen

- `tests/test_alpha7_manual_restart.py`: Standard aus, historische Fingerprints,
  unveränderliche Freigabe, Admin-Prüfung, Identitäts-/Zielschutz, Vorschau,
  Auswirkungen, neue Episode, Audit/Command/Envelope/WS, Idempotenz, Ablaufzeit,
  fehlende Bestätigung, Version/Zustand geändert, Commitfehler, Restore,
  positive/negative Datenbestätigung, Konstanten/Fristen/normale Befehle.
- `tests/test_postgres.py`, `test_alpha7_manual_restart_survives_process_restart_without_replay`:
  echte PostgreSQL-Persistenz und Prozessneustart; lokal ohne isolierte Test-DB
  übersprungen, obligatorischer CI-Nachweis steht vor Abschluss aus.
- `frontend/src/alpha7/manualRestart.test.tsx`: sichtbare Sperre, Auswirkungsvorschau,
  Begründung/Bestätigung, Versions-/Zustandswechsel, verlorene Antwort ohne
  erneuten POST, Wechsel der Ansicht, Freigabe im Editor und manueller Statuschip.
- `frontend/src/e2e.test.tsx`, Fall „restarts an opted-in machine …“: Freigabe
  durch Editor, echter API-/Engine-Durchlauf, bestätigter manueller Neustart,
  manuelles WebSocket-Signal, spätere Datenbestätigung sowie persistierte
  Übergangs-/Auditnachweise. Ausschließlich isolierte MemoryStore-Testinstanz.

Firefox-/Chrome-Sichtnachweise und vollständige PR-CI sind vor dem technischen
Abschluss noch zu liefern. Es wurde keine Installation bedient. Merge, Release,
Publish, Installation und Live bleiben Bennis eigene Freigaben.
