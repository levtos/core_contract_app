# Alpha 8: Plattformformate

Die ADRs 0005–0011 und Bennis Claude-Review-Freigabe sind bindend. Neue Regeln
benötigen `language_version: 2`; bestehende Sprache-1-Definitionen, boolesche
Buckets und Fingerprints bleiben lesbar. Nicht mehr erforderlich: `test.*`,
`schema.fixture: true` oder ein synthetischer Scope-Wächter. Mitgelieferte
Paket-Fixtures bleiben ausdrücklich als solche gekennzeichnet; sie enthalten
keine produktiven Fachverträge.

## Einstellungen je Vertrag (G19)

`parameter_schema` an der Vorlage bildet Namen auf `{schema, minimum?,
maximum?, label?, description?}` ab. Erlaubt sind endliche skalare Werte;
`schema.required`, Wertelisten, Zeitstempel und numerische Grenzen werden strikt
geprüft. `parameter_relations` enthält `{left, comparison, right}`, etwa
`home_distance < away_distance`. Unbekannte Werte/Namen und ungültige Relationen
blockieren die Übernahme.

Der Vertrag enthält `parameters: {home_distance: 100, away_distance: 300}`.
Regeln lesen `{op: "parameter", name: "home_distance"}`. Fristen und Zeitregeln
akzeptieren entweder positive Sekunden oder diesen typisierten Parameterverweis.
Werte gehören zur Prüfsumme der Instanz: eine Änderung beginnt A-06 mit neuer
Vergleichsbasis und verwirft alte Hysterese-/Zeitanker. Sie ändert keine
Vorlagenversion. Die UI sammelt Änderungen im Entwurf und erklärt:
„Deine Änderung gilt erst, wenn du den Entwurf übernimmst.“

## Uhr und Kalender (G1)

Quelle mit Dependency `kind: clock`, Binding-Adapter `kind: scheduler` und
`calendar: {projection: minute_of_day}`. Zulässige Projektionen:
`timestamp` (UTC-Zeitstempel als Vertragseingang), `date`, optionaler Text
`time`, `weekday` (Montag=1), `minute_of_day` (0–1439), `day_of_year`
(1–366), `season`, `anniversary`. Lokale Ableitungen verwenden ausschließlich
Europe/Berlin aus der gepinnten tzdata-Distribution. Jahreszeiten deklarieren
sortierte eindeutige `seasons: [{name, start: "MM-DD"}]`; Jahrestage `month_day`
und für den 29. Februar explizit `leap_day: skip|feb28|mar01`.

Standardauflösung ist eine Minute. `resolution: second` ist nur ausdrücklich
für `timestamp` oder `time` erlaubt. Der Scheduler plant den nächsten tatsächlich
relevanten Zeitpunkt, statt jede Sekunde alle Verträge neu zu bewerten.
`{op: time_reached, at: <Zeitstempelregel>}` plant zusätzlich genau diesen Termin.
Nach Neustart wird aus Uhr und Registry neu berechnet; verpasste Termine werden
nicht als künstliche Ereignisfolge nachgespielt. DST überspringt fehlende Minuten,
wiederholt die Herbststunde mit eindeutigen UTC-Zeitpunkten und setzt Tageswerte
am nächsten lokalen Mitternachtstermin um.

## n-Klassen-Bucket (G13)

`bucket` behält das alte Bool-Format. Neu: `classes: ["kühl", "angenehm", "warm"]`,
typisiertes `schema`, zwei `boundaries: [{at: <Zahlregel>}, ...]` und verpflichtend
`initial: {class: "angenehm"}` oder `{unknown: true}`. Grenzen dürfen Eingänge
oder Instanzparameter lesen. Optional je Grenze:
`hysteresis: {lower: <Zahlregel>, upper: <Zahlregel>}`.

Grenzen müssen endlich, in derselben Einheit, streng geordnet und mit nicht
überlappenden Umschaltbereichen vorliegen. Aufwärts schaltet `>= upper`,
abwärts `< lower`; ohne Hysterese entscheidet `at`. Große Sprünge überspringen
mehrere Klassen. Unbekannte Eingänge oder ungültige dynamische Grenzen liefern
unknown und setzen den Latch zurück. Nach Neustart gilt erneut die explizite
Initialisierung; alte Latches sind keine neue Evidence.

## Geschlossene Textregeln (G3)

`lower`, `strip`, `normalize_key`, `matches`, `contains`, `compound_key`
arbeiten mit typisierten `args`. Normalisierung vereinheitlicht deklarierte
`delimiters` zu `separator`; `matches` verwendet begrenzte Shell-Muster
(`*`, `?`, Zeichenklassen), keine frei ausführbare Sprache oder Regex.
Maximal 8192 Zeichen je Text und 256 je Muster. Der zusammengesetzte Schlüssel
kodiert ein JSON-Array, sodass Trennzeichen in Einzelwerten nicht kollidieren.

## Versionen und Formelkatalog (G5/G6)

Vorlagen und Kataloge tragen `lifecycle: active|deprecated|retired`.
Auslaufen und Zurückziehen ändern keinen bestehenden gepinnten Vertrag.
Eine zurückgezogene Version wird für neue Bindungen abgewiesen; historische
Versionen bleiben gespeichert. Rückkehr zu active verlangt eine ausdrückliche
neue `reactivation_note`. Fachlicher Inhalt bleibt je Version unveränderlich;
Lebenszyklus, Name und Beschreibung sind redaktionelle Metadaten.

Registrierte Formeln deklarieren `inputs: [{name, schema, quantity, required}]`,
`output_schema`, `category` und Lebenszyklus. Benannte Aufrufe verwenden
`args: {temperature: <°C-Regel>, humidity: <%-Regel>}`. Einheiten werden pro
Eingang geprüft, nicht über alle Argumente gleichgesetzt. Fehlende Pflichtnamen,
unbekannte Namen und falsche Einheiten blockieren. Alte Positionsargumente
bleiben kompatibel. Formeln werden weiterhin als geprüfter Paketcode registriert;
Alpha 8 führt keine frei programmierbaren Nutzerformeln und keine Fachformel-
Portierung ein. Auch Paketformeln brauchen für eine Wiederfreigabe eine Begründung.

## Vollständigkeit und HA (G14/G17)

`configuration_hint` nimmt `arg`, boolesches `when`, `code` und `message`.
Ein unzugeordneter, aber gültiger Wert bleibt gültig und erhält separat
`configuration: {complete: false, hints: [{code, message}]}`. Hinweise wandern
mit den entscheidenden Eingängen weiter. Fehlende oder veraltete Signale behalten
ihren eigenen Status. Übersicht und Problemdaten trennen Signalstörung und
Konfigurationsvollständigkeit. Keine Alarmierung allein wegen fehlender Zuordnung.
Der produktive Hybrid-Titelkatalog bleibt Alpha 10.

HA-Verbindungsverlust verfälscht keine gespeicherten Beobachtungen. Normale
Freshness, Liveness, Heartbeat und Grace gelten weiter. Der Adapter
`connectivity` liefert als eigene, persistierte Evidence `ready|starting|unavailable`
für eine Connectivity-Quelle. Die Übersicht nennt seit wann HA getrennt ist und
wie viele zustandsbehaftete HA-Werte ohne Frist gültig bleiben. Öffnungen und
Heizfreigaben brauchen eine ausdrückliche Heartbeat-/Liveness-Regel (§3 P4-65).

## G20: nur geprüft

`source_type: event` ist bisher eine typisierte Quelle, kein quittierter
Ereigniskanal. Der Processor speichert Berichte und ihre Referenzen, aber ein
Bool-Edge kann zwei aufeinanderfolgende gleiche Ereignisse nicht unterscheiden;
nach Transportlücken wird keine Folge rekonstruiert. Ein Rohereignis mit
`since_at` lässt sich modellieren, eine allgemeine genau-einmalige Verarbeitung
mit Replay-/Consumer-Cursor ist damit nicht nachgewiesen. G20 bleibt als
Prüfpunkt offen; Alpha 8 fügt dafür keinen neuen Operator und keinen Prototyp ein.
