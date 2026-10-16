# Versionen und redaktionelle Metadaten (P10)

Der globale Entwurfsbalken enthält den einzigen Knopf „Speichern“ für den
Entwurf. Übernehmen und Zurücksetzen erzeugen weiterhin neue, unveränderliche
Versionen mit der bisherigen Versionsprüfung.

Benni hat die dauerhafte Speicherung reiner Versionsmetadaten ausdrücklich
freigegeben. Beide Aktionen nehmen eine freiwillige `note` (Text, maximal 256
Zeichen) entgegen. Leerraum am Rand wird entfernt; eine leere Notiz wird
weggelassen. Die neue Versionszeile und der administrative Protokolleintrag
enthalten die Notiz. Der Akteur kommt aus der serverseitigen Anmeldung, nicht
aus einem übermittelten Namen. Eine rollenbasierte Anmeldung belegt keine
persönliche Identität; die Oberfläche nennt deshalb beispielsweise
„Administrator · Zugangsschlüssel“.

Die Metadaten stehen außerhalb von `config`. Sie beeinflussen weder Auswertung,
Fingerprints noch Konfigurationsprüfsumme. Zurücksetzen kopiert nur die alte
Konfiguration; die neue Version erhält ihre eigene Notiz und ihren aktuellen
Akteur. Historische Zeilen werden nicht nachträglich verändert. Alte Akteure
werden, soweit aufgezeichnet, aus dem Protokoll gelesen; andernfalls wird der
fehlende Nachweis ausdrücklich angezeigt. Eine Datenbankmigration ist für die
bestehenden JSON-Nutzdaten nicht erforderlich.

Die Versionsliste bietet Zurücksetzen ausschließlich für ältere Versionen an.
Solange HTTP- und Live-Stand nicht übereinstimmen, bleibt die Aktion verborgen
und ein Satz erklärt den Grund. Der Bestätigungsdialog prüft zusätzlich den
aktuellen Stand und hält die bestehende serverseitige Versionsprüfung ein.

Neue Objekte im Vergleich beginnen zum ersten Mal. Sie werden nicht als Verlust
eines bisherigen Zeitkontexts dargestellt. Tatsächlich möglicherweise neu
initialisierte Bestandskontexte bleiben sichtbar. Prüfsummen und technische
Identitätsänderungen liegen unter „Erweitert“.

Nachweise: sechs RTL-Interaktionstests in `versions.test.tsx`, fünf API-Tests in
`test_alpha7_version_metadata.py`, bestehende Aktivierungs-/Konflikttests und
Engine-E2E. Browsernachweise werden in der abschließenden Sichtprüfung ergänzt.
