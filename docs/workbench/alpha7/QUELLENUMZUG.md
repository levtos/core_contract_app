# Alpha 7 – Quelle umziehen (P8)

Auftrag: [Issue #19](https://github.com/levtos/core_contract_app/issues/19),
aufbauend auf der historischen Typ-/Einheitssperre aus Alpha 6.

## Bedienung

1. Unter **Quellen → Geräte aus Home Assistant** eine Quelle wählen und
   **Quelle mit anderem Typ anlegen** öffnen. Derselbe Weg ist direkt an einer
   Prüfmeldung `immutable_source_type` erreichbar. Bei Bedarf startet automatisch
   ein Entwurf; die Seite bleibt erhalten.
2. Name, neue Werteart und gegebenenfalls Einheit oder Werteliste wählen.
   Die neue Kennung wird vorgeschlagen; bereits historisch verwendete Kennungen
   werden nicht erneut angeboten. Unter **Erweitert** bleiben Kennung,
   MQTT-Datenpfad, Attribut und ausdrückliche Umrechnung/Zuordnung zugänglich.
3. Je direkt verbundenem Vertrag entscheiden, ob er umgestellt wird. Vorlagen,
   die ausschließlich einen Gerätewert weitergeben, können als neue, passende
   Version angelegt werden. Bestehende Versionen bleiben unverändert. Für eigene
   Berechnungen oder Abläufe eine passende Vorlagenversion vorbereiten und im
   Dialog auswählen; Terra erfindet keine neuen Rechen- oder Ablaufregeln.
4. **Umzug prüfen** prüft den gesamten Kandidaten am Server, einschließlich
   aller nachgelagerten Verträge. Anzahl direkter/indirekter Betroffener und neuer
   Vorlagenversionen werden angezeigt. Ein Fehler verhindert die Übernahme.
5. **In Entwurf übernehmen** ändert den Entwurf atomar. Die laufenden Verträge
   ändern sich erst über den bestehenden Prüf-/Bestätigungsweg in der Kopfzeile.

Die neue Einheit benennt einen Wert; sie führt keine Umrechnung durch.
Eine erforderliche Umrechnung ist ausdrücklich unter **Erweitert** einzurichten.
Für eine Auswahl ist eine bestehende Werteliste zur Gerätewert-Zuordnung nötig.

## Ein physischer Nachweis zählt einmal

Ein Teilumzug kann ein anderes Gerät beziehungsweise einen anderen Datenpfad
nutzen. Dann bleiben die alte Verbindung und die nicht ausgewählten Verträge
unverändert. Beim **selben** Gerätedatenpfad wandert die Verbindung zur neuen
Quelle; alle bisherigen Verwendungen müssen mit umziehen. Solange noch ein
Vertrag, eine Lebenszeichen-Quelle oder eine Abhängigkeitsüberwachung die alte
Quelle verwendet, zeigt der Dialog den Grund und verhindert diesen Umzug.
Alternativ kann ein anderes Gerät gewählt werden.

Die bestehenden Serverregeln `duplicate_adapter` und `duplicate_evidence` bleiben
vollständig erhalten. Es gibt weder doppelte Adapterpfade noch eine Umgehung
durch einen zweiten physischen Schlüssel.

## Historie und konkurrierende Änderungen

Die alte Quelle bleibt im Dokument; beim vollständigen Verbindungsumzug ist sie
ungebunden und unreferenziert. Ihre Entfernung bleibt eine ausdrückliche spätere
Entwurfsänderung. Alte Beobachtungen bleiben unter ihrer alten Kennung, Revision
und Werteart lesbar. Es werden keine alten Messwerte als neue Werte übernommen.
Selbst nach Entfernung und Wiederherstellung gilt die historische Typ-Sperre.

Wurde im Entwurf bereits eine gesperrte Werteart/Einheit geändert, wird beim Umzug
die historische Werteart der alten Quelle wiederhergestellt und die gewünschte
Werteart für die neue Quelle verwendet. Nicht semantische Bearbeitungen bleiben
erhalten. Die anschließende Serverprüfung schützt auch historische Wertelisten.

Ein Prüfergebnis gilt nur für genau den geprüften Entwurf, Dokumentinhalt und
Dialoginhalt. Jede Änderung entwertet es. Ein verspätetes Ergebnis darf weder
einen anderen Entwurf noch neuere lokale Änderungen überschreiben.

## Nachweise

- `frontend/src/alpha7/sourceMigration.test.tsx`: vollständiger/teilweiser Umzug,
  historische Kennungen, Wiederherstellung gesperrter Änderungen, Schutz von
  Lebenszeichen/Überwachung, Vorlagenversionen, tatsächliche Dialogbedienung,
  Entwurfsgrenze, Formularänderung und verspätete Prüfung.
- `tests/test_alpha7_source_migration.py`: Servervalidierung und Aktivierung,
  unpassende Verbrauchertypen, doppelte Nachweise/Adapter, alte Beobachtungen nach
  Umzug/Restore/Entfernung und weiterhin wirksame historische Sperre.
- `frontend/src/e2e.test.tsx`, Fall „moves a guided temperature source …“:
  Temperaturvertrag über Geräteführung erstellen, Umzug ausschließlich im
  Dialog prüfen und übernehmen, neue Vorlagenversion übernehmen, echte Engine
  liefert Text `21.5`; alte Beobachtungen behalten Rohtext und normalisierte
  Zahl `21.5`. Ausschließlich isolierte MemoryStore-Instanz und synthetische
  Geräte; keine Verbindung zu einer Home-Assistant-Installation.

Browser-Sichtnachweise in Firefox und Chrome folgen in der gemeinsamen visuellen
Prüfung; diese Datei behauptet dafür noch keine Abnahme.
