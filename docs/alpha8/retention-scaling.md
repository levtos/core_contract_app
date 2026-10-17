# Aufbewahrung und Skalierung (F1/F2)

Vor Produktion muss die Registry eine ausdrückliche Regel enthalten:

```json
{"history_retention": {"raw_days": 1, "rollup_days": 7, "batch_size": 1000, "interval_s": 3600}}
```

Das ist die synthetische Nachweiskonfiguration. Bennis produktive Quellrate und
Zeiträume müssen beim Teil-B-Runbook zu diesem Budget passen oder neu gemessen
werden. Der App-Entrypoint verlangt die Regel für Readiness. Alte Registries
bleiben lesbar; ohne Regel erfolgt keine Löschung und keine produktive Readiness.
Test-/Demo-Runtimes können ohne dieses Produktionsgate laufen.

## Verdichtung und Evidence

Einzelmessungen vor der Rohdatenfrist werden nach Empfangszeit ausgewählt,
höchstens batch_size je Transaktion (Standard 1.000, maximal 10.000).
Aktuelle Quellen und Evidence im aktuellen Contract-/Node-/Machine-Zustand
werden gepinnt; diese Rohzeilen bleiben auch jenseits der Frist erhalten.
Je Quelle, Binding, Registry-Version und UTC-Stunde entstehen Anzahl,
numerische Anzahl, Minimum/Maximum, dezimale Summe, Mittelwert und erster/letzter
Empfang. Bool, Text, restaurierte, retained und ungültige Werte werden nicht als
numerische Messwerte aggregiert. Die Statistik ersetzt niemals aktuelle Evidence.

Rollup-Upsert, Coverage-Wasserstand und Rohdatenlöschung liegen in **einer**
Transaktion. Fehler rollen alles zurück; Wiederholung zählt nichts doppelt.
Stundenwerte werden ebenfalls begrenzt nach rollup_days gelöscht. Volle Batches
planen einen Aufholschritt frühestens nach 60 Sekunden; sonst gilt interval_s.
Die Aufholgeschwindigkeit muss die produktive Rate übersteigen.

API (relativ zu /api/v1):

- POST history/retention/preview: Admin, begrenzte Vorschau ohne Änderung.
- POST history/retention/run: Admin, ein begrenzter Batch.
- GET history/rollups: begrenzte Keyset-Seiten, Quelle-/Zeitfilter.
- GET history/query/observations: Rohdaten über typisierten Quellen-/Zeitindex.
- GET evidence/reference/<ref>: erhaltene Rohzeile exakt; außerhalb der
  gehaltenen Coverage HTTP 410 mit evidence_outside_retention/retained_after.
  Sonst bleibt eine unbekannte Referenz 404.

Coverage ist eine Bereichsgrenze je Epoche/Revision/Adapter/Binding, kein
Verzeichnis aller jemals vorhandenen Referenzen. Ein alter fehlender Schlüssel
innerhalb dieses Bereichs kann 410 erhalten, ohne dass seine frühere Existenz
noch einzeln bewiesen wird. Gepinnte Rohzeilen werden stets zuerst gefunden.

## Migration, Restore und Betrieb

Migration 003 ergänzt Sidecar mit FK-Cascade, Trigger/Backfill, Stundenwerte und
Wasserstände. Sie löscht keine vorhandenen Rohdaten. Nummern und Prüfsummen der
Migrationen bleiben geschützt. Die echte PostgreSQL-Regression prüft Rollback
nach bereits erfolgtem Rollup-Upsert, begrenzte Löschung, Pins und Neustart.
Der Setup-Probe akzeptiert nur die bekannten neuen App-Objekte.

Vor Migration Backup und Platz für Backfill/Indizes einplanen. Ein vollständiger
pg_dump der Mimir-DB plus App-/data sichert auch Sidecar, Rollups und Wasserstände.
Restore in ein getrenntes Ziel mit Alpha-8-Code; kein Schema-Downgrade auf Terra.
Ein Rückschritt benötigt das vollständige vorherige Backup in einem isolierten
Ziel. Gepinnte aktuelle Evidence ist zusätzlich zum Zeitfenster zu budgetieren.
Vorschau/Run nennen Cutoffs, Zeilenzahl, Gruppen und Zahl gepinnter Referenzen.

## Konkretes Budget und F2

dev/alpha8_scale_probe.py akzeptiert ausschließlich TEST_DATABASE_DSN mit einer
*_test-Basis, erzeugt eine eigene zufällige *_test-DB und entfernt nur dieses Ziel.

| Last / Horizont | CI-Budget |
|---|---|
| 100.000 und 1.000.000 Rohmessungen | reale PostgreSQL-Zeilen und Querypläne |
| Evidence-PK, neueste Seite, Quelle/Zeit | jeweils P95 <250 ms, indexierter Plan |
| 1.000.000 Rohzeilen plus Sidecar/Indizes | <2.000.000.000 Byte |
| 1.024 Verträge, 2 Meldungen/s insgesamt, eine betroffene Teilkette | P95 Transaktion <500 ms |
| 2 Meldungen/s, 1 Tag Rohdaten | 172.800 Rohmessungen plus Pins |
| Stundenwerte | 7 Tage, getrennt nach Quelle/Binding/Revision |

Der Burst-Test verwendet die Quellrate als Uhrfortschritt ohne künstliche
Wartezeit. Messwerte/Pläne/Batchergebnis stehen in alpha8-scale.json; die
[Abnahme](ABNAHME.md) nennt den geprüften CI-Lauf.

Die Runtime cached Fingerprints, Typregistry und topologische Reihenfolge je
exakter Registry-Version/Prüfsumme/Pakettypen. Normale Eingangsänderungen bewerten
die transitive betroffene Teilmenge. Unveränderte Envelopes werden nur vor
fälligem Termin/Freshness-Ablauf und ohne Rückwärtssprung der Uhr wiederverwendet.
Revision, Tick/Frist, Command, Recovery und Restore verwenden den vollständigen
Pfad. Kein mutabler Cache von Instanzparametern.

Äquivalenztests vergleichen Teil- und Vollauswertung einschließlich abhängiger
Verträge und TTL-Ablauf. Bestehende Command-, Deadline-, Recovery-, Commit-/
Publication- und PostgreSQL-Tests laufen mit. O(n)-Kosten bleiben für
Zustandskopie, Eingangsprüfung und Commit-Vergleich; ein gleichzeitig vollständig
betroffener Graph wird weiter vollständig bewertet. Größere Produktionsbudgets
brauchen erneute Messung; Alpha 8 behauptet keine beliebige Skalierbarkeit.
