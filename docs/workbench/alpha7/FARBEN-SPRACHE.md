# Farben, Sprache und gesperrte Aktionen (P12)

Die Flächen sind neutral dunkel. Gedämpftes Petrol dient Marke, Navigation und
Hauptknöpfen. Links, Auswahlfelder, Regeldekoration und Diagrammlinien verwenden
neutrale Farben. Regeln werden nicht mehr nach Berechnungsart in Gesundheits-
oder Warnfarben eingefärbt. Vertragszustände behalten ihre fachliche Farbe:
Grün gesund, Gelb eingeschränkt/veraltet, Rot Fehler, Grau unbekannt oder
ausgeschaltet, Blau Information. Unbekannt ist niemals ein plausibles Nein.

Der Kontrasttest liest die tatsächlichen CSS-Farbwerte. Er berechnet nach WCAG
das relative Leuchten und den Kontrast auch für die gemischten Chip-Hintergründe
auf allen vier verwendeten Flächen. Alle Statusfarben, graue Texte einschließlich
„unbekannt“ und Hauptknöpfe einschließlich Hover erreichen mindestens **4,5:1**
für kleine Schrift (AA). Die Sichtprüfung beider Browser ergänzt diesen
rechnerischen Nachweis; sie ist keine vollständige Barrierefreiheitsabnahme.

Warnungen bleiben als Text mit Symbol sichtbar, ohne gelbe Seitenkästen.
Redaktionelle Entwürfe tragen eine blaue Informationsmarkierung. Ein bereits
übernommener Vorlagenstand bleibt mit verständlicher Sperrbegründung versehen.
Soweit ein Knopf wegen einer laufenden Aktion oder fehlender Voraussetzung
gesperrt ist, steht der Grund sichtbar dabei und ist über `aria-describedby`
zugeordnet. Unmögliche Verschiebepfeile am Listenanfang/-ende entfallen.

Neue und überarbeitete Texte liegen in `de.json`. Protokollwerte bleiben im
Dokument unverändert; übersetzt werden ihre Beschriftungen. Insbesondere die
Vergleichswerte `eq`/`gt` usw. werden nicht mehr aus Übersetzungen zurück in den
Regelausdruck geschrieben. Fehler zeigen Handlungstexte; technische Fundstellen
liegen unter „Erweitert“. Namen und Werte, die Nutzer selbst festlegen, bleiben
erhalten. `en.json` wird nicht verändert.

Der Sprachscanner erfasst nun auch sichtbare Beschriftungslisten in bedingten
Ausdrücken, voreingestellte Beschriftungen und Gründe für gesperrte Knöpfe. Acht
Scanner-Regressionstests schützen die Trennung zu technischen Kennungen. Fünf
RTL-/Kontrasttests prüfen die Darstellung und unveränderte Vergleichswerte.
