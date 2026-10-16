# Alpha 7 — Geräteführung und Nachweis

Die Aktion **Neuer Vertrag** öffnet zuerst die Geräteauswahl. Ein Gerät wählen,
**Vertrag anlegen**, **Übernehmen**, Auswirkungen bestätigen, **Jetzt übernehmen**:
zusammen sechs Klicks ab der Vertragsliste. Namen und Fachkennungen sind vorbelegt;
die Kennungen stehen unter **Erweitert**. **Ohne Gerät anlegen** führt zum manuellen
Editor für andere Anwendungsfälle.

Die Führung schreibt einen gewöhnlichen Entwurf mit Quelle, HA-Abhängigkeit,
Verknüpfung, ausdrücklicher Typumwandlung und bei einem neuen Vertrag einer
typgleichen Durchreich-Vorlage. Kein Browserwert wird als Beobachtung eingespeist.
Vorhandene HA-Verknüpfungen verwenden ihre Quelle weiter und ergänzen nur eine
fehlende Umwandlung; vorhandene Umwandlungen und historische Typen bleiben erhalten.
Abweichende Typen oder Einheiten verlangen den Quellenumzug aus P8.
Aktualität bleibt die deklarierte Serverregel; Temperatur, Kontakt, Bewegung und
Zähler bekommen änderbare Vorlagen. Bei Kontakten macht bloßes Alter keinen Fehler.

Die Liste zeigt den begrenzten HA-Vorschauwert und die Bereichszuordnung aus der
ausdrücklichen Admin-Abfrage `ha/entities?preview=1`. Diese Auswahlhilfe verändert
weder Geräte noch Berechnung oder Aktualität. Die Standardabfrage bleibt ohne Werte.
Siehe [API-Vertrag](../../alpha4/workbench-api.md).

`devices.test.tsx` prüft die sechs Klicks, automatische Verknüpfungen, Bereich und
Geräteart, Kontakt-Erklärung, Kennungswechsel ohne Editorverlust und die Auswahl
beim Wechsel der Quellen-Unterseiten. Auswahlmetadaten enthalten nur Kennungen,
getrennt nach Installation, Entwurf und Sammlung.

Der Engine-Test verwendet die unverändert eingecheckte Kopie der ursprünglichen
Datei [testdaten/ux12-komplett.json](https://github.com/levtos/core_contract_app/blob/review/ux-12/docs/workbench/review-12/testdaten/ux12-komplett.json).
Original und `frontend/test/fixtures/ux12-komplett.json` haben denselben Git-Blob
`11a8495f3a6cbe1ac196cbe02a0196515ef5b93c`. Der Import geht über die Oberfläche;
alle sieben Typumwandlungen ergänzt die Geräteführung. Der Test korrigiert außerdem
die zwei schon für Alpha 6 bekannten Vorlagenstellen über ihre jeweiligen
Bedienelemente (Ablauf-Neustartbedingung und Einheit des Differenz-Ausgabefeldes).
Keine Umwandlung wird im Test von Hand eingetragen. Die echte Engine muss danach
den Temperaturwert `21.5` und den Kontaktwert `false` liefern.

Die Testinstanz in `dev/workbench_demo.py` nutzt nur `MemoryStore`, synthetische
Geräte und den vorhandenen Adapter zur Normalisierung. Sie öffnet keine Verbindung
zu Home Assistant oder PostgreSQL. Echtes Firefox-/Chrome-, Ingress- und
Installationsverhalten braucht die gesonderten visuellen bzw. Live-Nachweise.
