# Core Contracts — Delta-Audit Core-Profile und Dokumentationskorrekturen (2026-10-07)

> **Hinweis (Platform-Korrektur 2026-10-07):** Verweise auf die „Alpha-1-Build-Spezifikation“ meinen die inzwischen superseded Fassung. Die hier geprüften Inhalte gelten unverändert in der Platform-Alpha-1-Spezifikation (`docs/platform-alpha1/build-specification.md`) fort.

**Ergebnis:** `REMOVE CORE PROFILES FOR V1` · Dokumentationskorrekturen D1–D3 `KORREKTUR BESTÄTIGT` ·
`NO FREEZE IMPACT`
**Status:** In die Alpha-1-Build-Spezifikation übernommen (§11, DOCUMENTATION DELTA DD-1 bis DD-5).
Dieses Dokument ist der Prüfnachweis.

## A. Gesamturteil

`REMOVE CORE PROFILES FOR V1`. `profile` trägt im Zielmodell keine eigene Information. Es entspricht 1:1
der Installation. Der einzige eigene Effekt war ein verbotener impliziter Default
(„fehlt die Profilangabe → `benni`“, M17-01).

## B. Begründung

- **Herkunft:** Ursprünglich war `profile` ein Mandanten-Schlüssel innerhalb **einer** gemeinsamen
  Laufzeit (M18-11 (2): „eine Registry, zwei Adapter“). Mit APP-01 (eine App je Installation) und
  P4-65 CL-F1 (getrennte HA-Instanzen) ist dieser Zweck entfallen. CL-F1 setzt selbst gleich:
  „HA Benni → `benni`, HA Eltern → `eltern`“.

| Prüffrage | Ergebnis |
|---|---|
| Eigener Informationsgehalt | keiner; Abbildung Installation ↔ Profil ist umkehrbar eindeutig |
| Registry/Bindings | pro Installation getrennt; `profile_id` wiederholt nur die Installation |
| Evidence/Restore/Persistenz | durch Prozess- und DB-Grenze strukturell isoliert |
| API | Profilparameter erzeugte nur den Default-Fehler; ohne Profil bestimmt die Verbindung den Kontext |
| Contract-Identität | keine Semantik verzweigt nach Profil; Unterschiede = andere Instanzen und Definitionen |
| Spätere Erweiterbarkeit | Ein Mandantenschlüssel wäre eine Migration, kein Umbau des Grundmodells; Multi-User ist ohnehin nicht beschlossen |
| Zeitpunkt | jetzt am billigsten, weil der einzige Live-Consumer ohnehin auf den neuen Client umgestellt werden muss |

Der Begriff ist zudem mehrdeutig: Das Profil `eltern`, der Presence-Ort `parents` und „Eltern zu Besuch“
(eine Instanz in der Benni-Installation) sind drei verschiedene Dinge.

Policy-Profile (Komfort-, Heiz-, Haushaltsprofile) sind davon unberührt.

## C. Gegenbeispiele (geprüft, alle gelöst)

| Fall | Lösung ohne Profil |
|---|---|
| gleiche Contract-/Source-IDs in beiden Installationen | getrennte Registry und DB; IDs sind installationslokal |
| falsche DB oder Backup in falscher Installation | `installation_id` in `/data` und in DB-Metadaten, Abgleich beim Start |
| Consumer spricht die falsche App an | installationsgebundenes Token, `installation_id` im Handshake |
| Konfiguration als Vorlage wiederverwenden | Export/Import erzeugt einen Draft |
| zwei Personen in der Eltern-Installation | Instanzen (Haushalts-Presence, gemeinsamer Bio-State), kein Profil |
| Anzeige „Benni“/„Eltern“ | `installation_label`, nie in Logik oder IDs |

## D. Minimaler Delta

`profile`/`profile_id` entfallen in Binding, Instanz, API und Client. Ersatz durch `installation_id`
(UUID, Setup, `/data` + DB, Startprüfung, Handshake). Die Isolation bleibt vollständig erhalten. Die
genauen Aktenpatches stehen in Spezifikation DD-1/DD-2.

## E. Dokumentationskorrekturen

- **D1 `parents` bei Blind/Sichtschutz:** `KORREKTUR BESTÄTIGT`. P4-64 R-1a ersetzt P4-61 K5 für Blind
  Control ausdrücklich (`parents` wie `home`). Nur der Blind-Teil ist superseded; `parents` bleibt ein
  eigener Ort, und daraus wird kein Sleep abgeleitet. Mehrere Fundstellen, darunter die
  Consumer-Tabelle in P4-62 §4 (DD-3).
- **D2 Offenregister „Scope bei Eltern“:** `KORREKTUR BESTÄTIGT`. Geschlossen durch P4-63 §6 M-F (Media)
  und P4-64 R-1a (Blind) (DD-4).
- **D3 Activity-Skizze:** `KORREKTUR BESTÄTIGT`, Umfang um das Pilot-Set in M08-03 erweitert. Die
  Feldliste `active/variant/available` ist historisch; aktuell gelten M07-03 und M30-05 mit P4-54/55/58.
  `available` als Quality-Projektion bleibt gültig (DD-5).

## F. Spätere Cross-HA-Quellen

Einordnung als **Source-Herkunft** mit Installationsherkunft als Wert (`source_origin`), nicht als
Profilproblem.

## G. Freeze-Auswirkung

`NO FREEZE IMPACT`.
