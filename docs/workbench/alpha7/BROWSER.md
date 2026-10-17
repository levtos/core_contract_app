# Browser- und Bildnachweis Alpha 7

Aktueller Korrekturstand nach UX-Nachprüfung: [18 neue Bilder K.01–K.06](KORREKTUREN.md#browserprüfung). Die folgende Galerie dokumentiert den ursprünglichen Alpha-7-Stand; für die betroffenen Seiten gelten die neueren Bilder.

162 unveränderte Original-PNGs, jeweils **1920×1080**, Darstellungsfaktor 1,
de-DE, Europe/Berlin, dunkle Darstellung. Alle Bilder wurden auf Layout, Lesbarkeit,
Überlagerungen und deutsche Beschriftungen geprüft; Dialoge und Graph zusätzlich in Originalgröße.

Nachher: `419a6e72823398e3091add8f9479e2d7d9edc958`. Die folgenden Abschluss-Commits betreffen ausschließlich Nachweise.
Vorher: veröffentlichter Alpha-6-Dateibaum `main@4687c35` / `v1.0.0a6`;
der verwendete Alpha-6-Checkout besitzt denselben Git-Dateibaum (der Runner prüft das vor dem Start).
Die beiden Aufnahmezeiten und Quellstände stehen im [Manifest](screenshots/manifest-both-both.json).

| Browser | Fassung | Ausführung |
|---|---|---|
| Google Chrome | 155.0.8059.80 | Installierter Chrome-Kanal, eigenes isoliertes Profil, ohne sichtbares Fenster |
| Mozilla Firefox | 157.0 | Firefox/Gecko aus Playwright, eigenes isoliertes Profil, ohne sichtbares Fenster |

Der Runner bedient echte Seiten und die echte lokale App-API. Es gibt keine Browser-Antwortattrappen.
Geräte und Werte sind synthetisch; verwendet wird ausschließlich der flüchtige MemoryStore.
Bestehende Browserprofile, Home Assistant, PostgreSQL, MQTT und Live-Systeme wurden nicht verbunden.
Keine Aussage über HA Ingress/Supervisor oder eine Installation. Eine Prüfung im nativen Fenster
mit Bennis persönlichem Profil ist **nicht durchgeführt**; die verwendeten Browser-Engines und Bilder sind oben benannt.

Beide Browser: erster Temperaturvertrag in **6 Klicks**, einschließlich bestätigter Übernahme,
ohne Fach-ID oder manuelle Transformation. Live-Vorlagenreiter und ausklappbare Details lassen sich
per Maus und Tastatur lesen, während Eingaben gesperrt bleiben. Ein Ablauf erhält über eine neue
Vorlagenversion ausdrücklich die Neustartfreigabe; anschließend wird der Neustart über den
Bestätigungsdialog an der echten API ausgeführt. Versionsnotiz und tatsächliche Rolle sind sichtbar.
Keine JavaScript-/HTTP-Fehler oder Dokumentüberläufe nachher; das ⋯-Menü überlagert keine Aktionen.
Ein vorhandener Alpha-6-Favicon-404 in Chrome ist als Vorher-Befund aufgezeichnet und in Alpha 7 behoben.

Reproduktion nach Python-/Frontend-Abhängigkeiten und Produktionsbuilds beider Checkouts:

```powershell
cd frontend
node scripts/browser-review.mjs --browser both --phase both --baseline ../../alpha6
```

Neue Unterseiten besitzen in Alpha 6 keine eigene Route. Ihre Vorher-Bilder zeigen die tatsächlich
vorhandene Sammelseite bzw. den vorhandenen Dialog; die Hash-Route steht je Bild im Manifest.
Die fünf alten Vorlagen-Unterbereiche werden im geöffneten Entwurf gezeigt, weil Alpha 6 ihre Reiter
in der Live-Ansicht sperrte. Alpha 7 zeigt dieselben Unterbereiche lesend in „Live ansehen“.
Neue Dialoge besitzen kein künstlich nachgebautes Vorher-Bild.

## Seiten und Unterbereiche

| Aufgabe | Chrome vorher | Chrome nachher | Firefox vorher | Firefox nachher |
|---|---|---|---|---|
| [Übersicht](#overview) | [Original](screenshots/before/chrome/overview.png) | [Original](screenshots/after/chrome/overview.png) | [Original](screenshots/before/firefox/overview.png) | [Original](screenshots/after/firefox/overview.png) |
| [Meine Verträge](#contracts-list) | [Original](screenshots/before/chrome/contracts-list.png) | [Original](screenshots/after/chrome/contracts-list.png) | [Original](screenshots/before/firefox/contracts-list.png) | [Original](screenshots/after/firefox/contracts-list.png) |
| [Vertrag auswählen](#contract-choice) | [Original](screenshots/before/chrome/contract-choice.png) | [Original](screenshots/after/chrome/contract-choice.png) | [Original](screenshots/before/firefox/contract-choice.png) | [Original](screenshots/after/firefox/contract-choice.png) |
| [Vertrag: Wert, Erklärung, Herkunft und Verlauf](#contract-detail) | [Original](screenshots/before/chrome/contract-detail.png) | [Original](screenshots/after/chrome/contract-detail.png) | [Original](screenshots/before/firefox/contract-detail.png) | [Original](screenshots/after/firefox/contract-detail.png) |
| [Vertrag: Konfiguration](#contract-config) | [Original](screenshots/before/chrome/contract-config.png) | [Original](screenshots/after/chrome/contract-config.png) | [Original](screenshots/before/firefox/contract-config.png) | [Original](screenshots/after/firefox/contract-config.png) |
| [Vertrag: Abhängigkeiten](#contract-dependencies) | [Original](screenshots/before/chrome/contract-dependencies.png) | [Original](screenshots/after/chrome/contract-dependencies.png) | [Original](screenshots/before/firefox/contract-dependencies.png) | [Original](screenshots/after/firefox/contract-dependencies.png) |
| [Vertrag importieren](#contract-import) | [Original](screenshots/before/chrome/contract-import.png) | [Original](screenshots/after/chrome/contract-import.png) | [Original](screenshots/before/firefox/contract-import.png) | [Original](screenshots/after/firefox/contract-import.png) |
| [Zusammenhänge: laufende Konfiguration](#relations) | [Original](screenshots/before/chrome/relations.png) | [Original](screenshots/after/chrome/relations.png) | [Original](screenshots/before/firefox/relations.png) | [Original](screenshots/after/firefox/relations.png) |
| [Eigene Vorlagen](#templates-own) | [Original](screenshots/before/chrome/templates-own.png) | [Original](screenshots/after/chrome/templates-own.png) | [Original](screenshots/before/firefox/templates-own.png) | [Original](screenshots/after/firefox/templates-own.png) |
| [Eingebaute Vorlagen](#templates-built-in) | [Original](screenshots/before/chrome/templates-built-in.png) | [Original](screenshots/after/chrome/templates-built-in.png) | [Original](screenshots/before/firefox/templates-built-in.png) | [Original](screenshots/after/firefox/templates-built-in.png) |
| [Vorlage: Allgemein](#template-detail) | [Original](screenshots/before/chrome/template-detail.png) | [Original](screenshots/after/chrome/template-detail.png) | [Original](screenshots/before/firefox/template-detail.png) | [Original](screenshots/after/firefox/template-detail.png) |
| [Geräte aus Home Assistant](#sources-devices) | [Original](screenshots/before/chrome/sources-devices.png) | [Original](screenshots/after/chrome/sources-devices.png) | [Original](screenshots/before/firefox/sources-devices.png) | [Original](screenshots/after/firefox/sources-devices.png) |
| [Verknüpfungen](#sources-bindings) | [Original](screenshots/before/chrome/sources-bindings.png) | [Original](screenshots/after/chrome/sources-bindings.png) | [Original](screenshots/before/firefox/sources-bindings.png) | [Original](screenshots/after/firefox/sources-bindings.png) |
| [Wertelisten](#sources-catalogs) | [Original](screenshots/before/chrome/sources-catalogs.png) | [Original](screenshots/after/chrome/sources-catalogs.png) | [Original](screenshots/before/firefox/sources-catalogs.png) | [Original](screenshots/after/firefox/sources-catalogs.png) |
| [Abhängigkeiten (Erweitert)](#sources-dependencies) | [Original](screenshots/before/chrome/sources-dependencies.png) | [Original](screenshots/after/chrome/sources-dependencies.png) | [Original](screenshots/before/firefox/sources-dependencies.png) | [Original](screenshots/after/firefox/sources-dependencies.png) |
| [Entwürfe](#changes-drafts) | [Original](screenshots/before/chrome/changes-drafts.png) | [Original](screenshots/after/chrome/changes-drafts.png) | [Original](screenshots/before/firefox/changes-drafts.png) | [Original](screenshots/after/firefox/changes-drafts.png) |
| [Versionen](#changes-versions) | [Original](screenshots/before/chrome/changes-versions.png) | [Original](screenshots/after/chrome/changes-versions.png) | [Original](screenshots/before/firefox/changes-versions.png) | [Original](screenshots/after/firefox/changes-versions.png) |
| [Import/Export](#changes-transfer) | [Original](screenshots/before/chrome/changes-transfer.png) | [Original](screenshots/after/chrome/changes-transfer.png) | [Original](screenshots/before/firefox/changes-transfer.png) | [Original](screenshots/after/firefox/changes-transfer.png) |
| [Systemstatus](#settings-system) | [Original](screenshots/before/chrome/settings-system.png) | [Original](screenshots/after/chrome/settings-system.png) | [Original](screenshots/before/firefox/settings-system.png) | [Original](screenshots/after/firefox/settings-system.png) |
| [Installation & Einrichtung](#settings-installation) | [Original](screenshots/before/chrome/settings-installation.png) | [Original](screenshots/after/chrome/settings-installation.png) | [Original](screenshots/before/firefox/settings-installation.png) | [Original](screenshots/after/firefox/settings-installation.png) |
| [Verbindungen](#settings-connections) | [Original](screenshots/before/chrome/settings-connections.png) | [Original](screenshots/after/chrome/settings-connections.png) | [Original](screenshots/before/firefox/settings-connections.png) | [Original](screenshots/after/firefox/settings-connections.png) |
| [Zugangsschlüssel](#settings-keys) | [Original](screenshots/before/chrome/settings-keys.png) | [Original](screenshots/after/chrome/settings-keys.png) | [Original](screenshots/before/firefox/settings-keys.png) | [Original](screenshots/after/firefox/settings-keys.png) |
| [Protokoll](#settings-log) | [Original](screenshots/before/chrome/settings-log.png) | [Original](screenshots/after/chrome/settings-log.png) | [Original](screenshots/before/firefox/settings-log.png) | [Original](screenshots/after/firefox/settings-log.png) |
| [Experten-Diagnose: Aktueller Zustand](#diagnostics-state) | [Original](screenshots/before/chrome/diagnostics-state.png) | [Original](screenshots/after/chrome/diagnostics-state.png) | [Original](screenshots/before/firefox/diagnostics-state.png) | [Original](screenshots/after/firefox/diagnostics-state.png) |
| [Experten-Diagnose: Vertragsdiagnose](#diagnostics-diagnosis) | [Original](screenshots/before/chrome/diagnostics-diagnosis.png) | [Original](screenshots/after/chrome/diagnostics-diagnosis.png) | [Original](screenshots/before/firefox/diagnostics-diagnosis.png) | [Original](screenshots/after/firefox/diagnostics-diagnosis.png) |
| [Experten-Diagnose: Verlauf](#diagnostics-history) | [Original](screenshots/before/chrome/diagnostics-history.png) | [Original](screenshots/after/chrome/diagnostics-history.png) | [Original](screenshots/before/firefox/diagnostics-history.png) | [Original](screenshots/after/firefox/diagnostics-history.png) |
| [Experten-Diagnose: Veröffentlichungen und Lücken](#diagnostics-publications) | [Original](screenshots/before/chrome/diagnostics-publications.png) | [Original](screenshots/after/chrome/diagnostics-publications.png) | [Original](screenshots/before/firefox/diagnostics-publications.png) | [Original](screenshots/after/firefox/diagnostics-publications.png) |
| [Experten-Diagnose: Nachweis](#diagnostics-evidence) | [Original](screenshots/before/chrome/diagnostics-evidence.png) | [Original](screenshots/after/chrome/diagnostics-evidence.png) | [Original](screenshots/before/firefox/diagnostics-evidence.png) | [Original](screenshots/after/firefox/diagnostics-evidence.png) |
| [Experten-Diagnose: Befehle](#diagnostics-commands) | [Original](screenshots/before/chrome/diagnostics-commands.png) | [Original](screenshots/after/chrome/diagnostics-commands.png) | [Original](screenshots/before/firefox/diagnostics-commands.png) | [Original](screenshots/after/firefox/diagnostics-commands.png) |
| [Entwurf: Prüfung und Änderungen](#draft-details) | [Original](screenshots/before/chrome/draft-details.png) | [Original](screenshots/after/chrome/draft-details.png) | [Original](screenshots/before/firefox/draft-details.png) | [Original](screenshots/after/firefox/draft-details.png) |
| [Vorlage: Eingänge](#template-inputs) | [Original](screenshots/before/chrome/template-inputs.png) | [Original](screenshots/after/chrome/template-inputs.png) | [Original](screenshots/before/firefox/template-inputs.png) | [Original](screenshots/after/firefox/template-inputs.png) |
| [Vorlage: Ausgaben](#template-outputs) | [Original](screenshots/before/chrome/template-outputs.png) | [Original](screenshots/after/chrome/template-outputs.png) | [Original](screenshots/before/firefox/template-outputs.png) | [Original](screenshots/after/firefox/template-outputs.png) |
| [Vorlage: Benannte Regeln](#template-rules) | [Original](screenshots/before/chrome/template-rules.png) | [Original](screenshots/after/chrome/template-rules.png) | [Original](screenshots/before/firefox/template-rules.png) | [Original](screenshots/after/firefox/template-rules.png) |
| [Vorlage: Ablauf](#template-machine) | [Original](screenshots/before/chrome/template-machine.png) | [Original](screenshots/after/chrome/template-machine.png) | [Original](screenshots/before/firefox/template-machine.png) | [Original](screenshots/after/firefox/template-machine.png) |
| [Vorlage: JSON für Experten](#template-json) | [Original](screenshots/before/chrome/template-json.png) | [Original](screenshots/after/chrome/template-json.png) | [Original](screenshots/before/firefox/template-json.png) | [Original](screenshots/after/firefox/template-json.png) |
| [Geräteführung: erster Temperaturvertrag](#device-guide) | neu in Alpha 7 | [Original](screenshots/after/chrome/device-guide.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/device-guide.png) |
| [Änderungen übernehmen: Bestätigung](#takeover-confirmation) | neu in Alpha 7 | [Original](screenshots/after/chrome/takeover-confirmation.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/takeover-confirmation.png) |
| [Offene Bedingungen mit Lösungslink](#readiness-conditions) | neu in Alpha 7 | [Original](screenshots/after/chrome/readiness-conditions.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/readiness-conditions.png) |
| [Zusammenhänge: Entwurf](#relations-draft) | neu in Alpha 7 | [Original](screenshots/after/chrome/relations-draft.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/relations-draft.png) |
| [Neue Vorlagenversion mit Vertragsauswahl](#template-new-version) | neu in Alpha 7 | [Original](screenshots/after/chrome/template-new-version.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/template-new-version.png) |
| [Freigabe des manuellen Ablauf-Neustarts](#template-restart-permission) | neu in Alpha 7 | [Original](screenshots/after/chrome/template-restart-permission.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/template-restart-permission.png) |
| [Ablauf-Neustart: Auswirkungen und Bestätigung](#manual-restart-impact) | neu in Alpha 7 | [Original](screenshots/after/chrome/manual-restart-impact.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/manual-restart-impact.png) |
| [Ablauf-Neustart: gespeichertes Ergebnis](#manual-restart-result) | neu in Alpha 7 | [Original](screenshots/after/chrome/manual-restart-result.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/manual-restart-result.png) |
| [Versionen mit Zeitpunkt, Rolle und Notiz](#versions-with-note) | neu in Alpha 7 | [Original](screenshots/after/chrome/versions-with-note.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/versions-with-note.png) |
| [Auf ältere Version zurücksetzen: Bestätigung](#rollback-confirmation) | neu in Alpha 7 | [Original](screenshots/after/chrome/rollback-confirmation.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/rollback-confirmation.png) |
| [Quelle mit anderer Werteart umziehen](#source-move) | neu in Alpha 7 | [Original](screenshots/after/chrome/source-move.png) | neu in Alpha 7 | [Original](screenshots/after/firefox/source-move.png) |

## Originalbilder

<a id="overview"></a>

### Übersicht

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/`

![Übersicht – chrome vorher](screenshots/before/chrome/overview.png)

**Chrome nachher**, Route `#/`

![Übersicht – chrome nachher](screenshots/after/chrome/overview.png)

**Firefox vorher**, Route `#/`

![Übersicht – firefox vorher](screenshots/before/firefox/overview.png)

**Firefox nachher**, Route `#/`

![Übersicht – firefox nachher](screenshots/after/firefox/overview.png)

</details>

<a id="contracts-list"></a>

### Meine Verträge

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/contracts`

![Meine Verträge – chrome vorher](screenshots/before/chrome/contracts-list.png)

**Chrome nachher**, Route `#/contracts/list/all`

![Meine Verträge – chrome nachher](screenshots/after/chrome/contracts-list.png)

**Firefox vorher**, Route `#/contracts`

![Meine Verträge – firefox vorher](screenshots/before/firefox/contracts-list.png)

**Firefox nachher**, Route `#/contracts/list/all`

![Meine Verträge – firefox nachher](screenshots/after/firefox/contracts-list.png)

</details>

<a id="contract-choice"></a>

### Vertrag auswählen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/contracts`

![Vertrag auswählen – chrome vorher](screenshots/before/chrome/contract-choice.png)

**Chrome nachher**, Route `#/contracts/select/contract`

![Vertrag auswählen – chrome nachher](screenshots/after/chrome/contract-choice.png)

**Firefox vorher**, Route `#/contracts`

![Vertrag auswählen – firefox vorher](screenshots/before/firefox/contract-choice.png)

**Firefox nachher**, Route `#/contracts/select/contract`

![Vertrag auswählen – firefox nachher](screenshots/after/firefox/contract-choice.png)

</details>

<a id="contract-detail"></a>

### Vertrag: Wert, Erklärung, Herkunft und Verlauf

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/contracts/fixture.flow`

![Vertrag: Wert, Erklärung, Herkunft und Verlauf – chrome vorher](screenshots/before/chrome/contract-detail.png)

**Chrome nachher**, Route `#/contracts/view/fixture.flow`

![Vertrag: Wert, Erklärung, Herkunft und Verlauf – chrome nachher](screenshots/after/chrome/contract-detail.png)

**Firefox vorher**, Route `#/contracts/fixture.flow`

![Vertrag: Wert, Erklärung, Herkunft und Verlauf – firefox vorher](screenshots/before/firefox/contract-detail.png)

**Firefox nachher**, Route `#/contracts/view/fixture.flow`

![Vertrag: Wert, Erklärung, Herkunft und Verlauf – firefox nachher](screenshots/after/firefox/contract-detail.png)

</details>

<a id="contract-config"></a>

### Vertrag: Konfiguration

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/contracts/fixture.flow?tab=config`

![Vertrag: Konfiguration – chrome vorher](screenshots/before/chrome/contract-config.png)

**Chrome nachher**, Route `#/contracts/view/fixture.flow?tab=config`

![Vertrag: Konfiguration – chrome nachher](screenshots/after/chrome/contract-config.png)

**Firefox vorher**, Route `#/contracts/fixture.flow?tab=config`

![Vertrag: Konfiguration – firefox vorher](screenshots/before/firefox/contract-config.png)

**Firefox nachher**, Route `#/contracts/view/fixture.flow?tab=config`

![Vertrag: Konfiguration – firefox nachher](screenshots/after/firefox/contract-config.png)

</details>

<a id="contract-dependencies"></a>

### Vertrag: Abhängigkeiten

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/contracts/fixture.flow?tab=deps`

![Vertrag: Abhängigkeiten – chrome vorher](screenshots/before/chrome/contract-dependencies.png)

**Chrome nachher**, Route `#/contracts/view/fixture.flow?tab=deps`

![Vertrag: Abhängigkeiten – chrome nachher](screenshots/after/chrome/contract-dependencies.png)

**Firefox vorher**, Route `#/contracts/fixture.flow?tab=deps`

![Vertrag: Abhängigkeiten – firefox vorher](screenshots/before/firefox/contract-dependencies.png)

**Firefox nachher**, Route `#/contracts/view/fixture.flow?tab=deps`

![Vertrag: Abhängigkeiten – firefox nachher](screenshots/after/firefox/contract-dependencies.png)

</details>

<a id="contract-import"></a>

### Vertrag importieren

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/registry`

![Vertrag importieren – chrome vorher](screenshots/before/chrome/contract-import.png)

**Chrome nachher**, Route `#/contracts/import/json`

![Vertrag importieren – chrome nachher](screenshots/after/chrome/contract-import.png)

**Firefox vorher**, Route `#/registry`

![Vertrag importieren – firefox vorher](screenshots/before/firefox/contract-import.png)

**Firefox nachher**, Route `#/contracts/import/json`

![Vertrag importieren – firefox nachher](screenshots/after/firefox/contract-import.png)

</details>

<a id="relations"></a>

### Zusammenhänge: laufende Konfiguration

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/graph`

![Zusammenhänge: laufende Konfiguration – chrome vorher](screenshots/before/chrome/relations.png)

**Chrome nachher**, Route `#/contracts/relations/graph`

![Zusammenhänge: laufende Konfiguration – chrome nachher](screenshots/after/chrome/relations.png)

**Firefox vorher**, Route `#/graph`

![Zusammenhänge: laufende Konfiguration – firefox vorher](screenshots/before/firefox/relations.png)

**Firefox nachher**, Route `#/contracts/relations/graph`

![Zusammenhänge: laufende Konfiguration – firefox nachher](screenshots/after/firefox/relations.png)

</details>

<a id="templates-own"></a>

### Eigene Vorlagen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions`

![Eigene Vorlagen – chrome vorher](screenshots/before/chrome/templates-own.png)

**Chrome nachher**, Route `#/templates/own`

![Eigene Vorlagen – chrome nachher](screenshots/after/chrome/templates-own.png)

**Firefox vorher**, Route `#/definitions`

![Eigene Vorlagen – firefox vorher](screenshots/before/firefox/templates-own.png)

**Firefox nachher**, Route `#/templates/own`

![Eigene Vorlagen – firefox nachher](screenshots/after/firefox/templates-own.png)

</details>

<a id="templates-built-in"></a>

### Eingebaute Vorlagen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions`

![Eingebaute Vorlagen – chrome vorher](screenshots/before/chrome/templates-built-in.png)

**Chrome nachher**, Route `#/templates/built-in`

![Eingebaute Vorlagen – chrome nachher](screenshots/after/chrome/templates-built-in.png)

**Firefox vorher**, Route `#/definitions`

![Eingebaute Vorlagen – firefox vorher](screenshots/before/firefox/templates-built-in.png)

**Firefox nachher**, Route `#/templates/built-in`

![Eingebaute Vorlagen – firefox nachher](screenshots/after/firefox/templates-built-in.png)

</details>

<a id="template-detail"></a>

### Vorlage: Allgemein

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Allgemein – chrome vorher](screenshots/before/chrome/template-detail.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Allgemein – chrome nachher](screenshots/after/chrome/template-detail.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Allgemein – firefox vorher](screenshots/before/firefox/template-detail.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Allgemein – firefox nachher](screenshots/after/firefox/template-detail.png)

</details>

<a id="sources-devices"></a>

### Geräte aus Home Assistant

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/sources?tab=sources&item=0`

![Geräte aus Home Assistant – chrome vorher](screenshots/before/chrome/sources-devices.png)

**Chrome nachher**, Route `#/sources/devices?item=0`

![Geräte aus Home Assistant – chrome nachher](screenshots/after/chrome/sources-devices.png)

**Firefox vorher**, Route `#/sources?tab=sources&item=0`

![Geräte aus Home Assistant – firefox vorher](screenshots/before/firefox/sources-devices.png)

**Firefox nachher**, Route `#/sources/devices?item=0`

![Geräte aus Home Assistant – firefox nachher](screenshots/after/firefox/sources-devices.png)

</details>

<a id="sources-bindings"></a>

### Verknüpfungen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/sources?tab=bindings&item=0`

![Verknüpfungen – chrome vorher](screenshots/before/chrome/sources-bindings.png)

**Chrome nachher**, Route `#/sources/bindings?item=0`

![Verknüpfungen – chrome nachher](screenshots/after/chrome/sources-bindings.png)

**Firefox vorher**, Route `#/sources?tab=bindings&item=0`

![Verknüpfungen – firefox vorher](screenshots/before/firefox/sources-bindings.png)

**Firefox nachher**, Route `#/sources/bindings?item=0`

![Verknüpfungen – firefox nachher](screenshots/after/firefox/sources-bindings.png)

</details>

<a id="sources-catalogs"></a>

### Wertelisten

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/sources?tab=catalogs&item=0`

![Wertelisten – chrome vorher](screenshots/before/chrome/sources-catalogs.png)

**Chrome nachher**, Route `#/sources/catalogs?item=0`

![Wertelisten – chrome nachher](screenshots/after/chrome/sources-catalogs.png)

**Firefox vorher**, Route `#/sources?tab=catalogs&item=0`

![Wertelisten – firefox vorher](screenshots/before/firefox/sources-catalogs.png)

**Firefox nachher**, Route `#/sources/catalogs?item=0`

![Wertelisten – firefox nachher](screenshots/after/firefox/sources-catalogs.png)

</details>

<a id="sources-dependencies"></a>

### Abhängigkeiten (Erweitert)

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/sources?tab=dependencies&item=0`

![Abhängigkeiten (Erweitert) – chrome vorher](screenshots/before/chrome/sources-dependencies.png)

**Chrome nachher**, Route `#/sources/dependencies?item=0`

![Abhängigkeiten (Erweitert) – chrome nachher](screenshots/after/chrome/sources-dependencies.png)

**Firefox vorher**, Route `#/sources?tab=dependencies&item=0`

![Abhängigkeiten (Erweitert) – firefox vorher](screenshots/before/firefox/sources-dependencies.png)

**Firefox nachher**, Route `#/sources/dependencies?item=0`

![Abhängigkeiten (Erweitert) – firefox nachher](screenshots/after/firefox/sources-dependencies.png)

</details>

<a id="changes-drafts"></a>

### Entwürfe

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/registry?tab=drafts`

![Entwürfe – chrome vorher](screenshots/before/chrome/changes-drafts.png)

**Chrome nachher**, Route `#/changes/drafts`

![Entwürfe – chrome nachher](screenshots/after/chrome/changes-drafts.png)

**Firefox vorher**, Route `#/registry?tab=drafts`

![Entwürfe – firefox vorher](screenshots/before/firefox/changes-drafts.png)

**Firefox nachher**, Route `#/changes/drafts`

![Entwürfe – firefox nachher](screenshots/after/firefox/changes-drafts.png)

</details>

<a id="changes-versions"></a>

### Versionen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/registry?tab=revisions`

![Versionen – chrome vorher](screenshots/before/chrome/changes-versions.png)

**Chrome nachher**, Route `#/changes/versions`

![Versionen – chrome nachher](screenshots/after/chrome/changes-versions.png)

**Firefox vorher**, Route `#/registry?tab=revisions`

![Versionen – firefox vorher](screenshots/before/firefox/changes-versions.png)

**Firefox nachher**, Route `#/changes/versions`

![Versionen – firefox nachher](screenshots/after/firefox/changes-versions.png)

</details>

<a id="changes-transfer"></a>

### Import/Export

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/registry`

![Import/Export – chrome vorher](screenshots/before/chrome/changes-transfer.png)

**Chrome nachher**, Route `#/changes/transfer`

![Import/Export – chrome nachher](screenshots/after/chrome/changes-transfer.png)

**Firefox vorher**, Route `#/registry`

![Import/Export – firefox vorher](screenshots/before/firefox/changes-transfer.png)

**Firefox nachher**, Route `#/changes/transfer`

![Import/Export – firefox nachher](screenshots/after/firefox/changes-transfer.png)

</details>

<a id="settings-system"></a>

### Systemstatus

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/admin`

![Systemstatus – chrome vorher](screenshots/before/chrome/settings-system.png)

**Chrome nachher**, Route `#/settings/system`

![Systemstatus – chrome nachher](screenshots/after/chrome/settings-system.png)

**Firefox vorher**, Route `#/admin`

![Systemstatus – firefox vorher](screenshots/before/firefox/settings-system.png)

**Firefox nachher**, Route `#/settings/system`

![Systemstatus – firefox nachher](screenshots/after/firefox/settings-system.png)

</details>

<a id="settings-installation"></a>

### Installation & Einrichtung

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/admin`

![Installation & Einrichtung – chrome vorher](screenshots/before/chrome/settings-installation.png)

**Chrome nachher**, Route `#/settings/installation`

![Installation & Einrichtung – chrome nachher](screenshots/after/chrome/settings-installation.png)

**Firefox vorher**, Route `#/admin`

![Installation & Einrichtung – firefox vorher](screenshots/before/firefox/settings-installation.png)

**Firefox nachher**, Route `#/settings/installation`

![Installation & Einrichtung – firefox nachher](screenshots/after/firefox/settings-installation.png)

</details>

<a id="settings-connections"></a>

### Verbindungen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/admin`

![Verbindungen – chrome vorher](screenshots/before/chrome/settings-connections.png)

**Chrome nachher**, Route `#/settings/connections`

![Verbindungen – chrome nachher](screenshots/after/chrome/settings-connections.png)

**Firefox vorher**, Route `#/admin`

![Verbindungen – firefox vorher](screenshots/before/firefox/settings-connections.png)

**Firefox nachher**, Route `#/settings/connections`

![Verbindungen – firefox nachher](screenshots/after/firefox/settings-connections.png)

</details>

<a id="settings-keys"></a>

### Zugangsschlüssel

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/admin`

![Zugangsschlüssel – chrome vorher](screenshots/before/chrome/settings-keys.png)

**Chrome nachher**, Route `#/settings/keys`

![Zugangsschlüssel – chrome nachher](screenshots/after/chrome/settings-keys.png)

**Firefox vorher**, Route `#/admin`

![Zugangsschlüssel – firefox vorher](screenshots/before/firefox/settings-keys.png)

**Firefox nachher**, Route `#/settings/keys`

![Zugangsschlüssel – firefox nachher](screenshots/after/firefox/settings-keys.png)

</details>

<a id="settings-log"></a>

### Protokoll

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/admin`

![Protokoll – chrome vorher](screenshots/before/chrome/settings-log.png)

**Chrome nachher**, Route `#/settings/log`

![Protokoll – chrome nachher](screenshots/after/chrome/settings-log.png)

**Firefox vorher**, Route `#/admin`

![Protokoll – firefox vorher](screenshots/before/firefox/settings-log.png)

**Firefox nachher**, Route `#/settings/log`

![Protokoll – firefox nachher](screenshots/after/firefox/settings-log.png)

</details>

<a id="diagnostics-state"></a>

### Experten-Diagnose: Aktueller Zustand

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=state&contract=fixture.flow`

![Experten-Diagnose: Aktueller Zustand – chrome vorher](screenshots/before/chrome/diagnostics-state.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=state&contract=fixture.flow`

![Experten-Diagnose: Aktueller Zustand – chrome nachher](screenshots/after/chrome/diagnostics-state.png)

**Firefox vorher**, Route `#/diagnostics?tab=state&contract=fixture.flow`

![Experten-Diagnose: Aktueller Zustand – firefox vorher](screenshots/before/firefox/diagnostics-state.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=state&contract=fixture.flow`

![Experten-Diagnose: Aktueller Zustand – firefox nachher](screenshots/after/firefox/diagnostics-state.png)

</details>

<a id="diagnostics-diagnosis"></a>

### Experten-Diagnose: Vertragsdiagnose

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=diagnosis&contract=fixture.flow`

![Experten-Diagnose: Vertragsdiagnose – chrome vorher](screenshots/before/chrome/diagnostics-diagnosis.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=diagnosis&contract=fixture.flow`

![Experten-Diagnose: Vertragsdiagnose – chrome nachher](screenshots/after/chrome/diagnostics-diagnosis.png)

**Firefox vorher**, Route `#/diagnostics?tab=diagnosis&contract=fixture.flow`

![Experten-Diagnose: Vertragsdiagnose – firefox vorher](screenshots/before/firefox/diagnostics-diagnosis.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=diagnosis&contract=fixture.flow`

![Experten-Diagnose: Vertragsdiagnose – firefox nachher](screenshots/after/firefox/diagnostics-diagnosis.png)

</details>

<a id="diagnostics-history"></a>

### Experten-Diagnose: Verlauf

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=history&contract=fixture.flow`

![Experten-Diagnose: Verlauf – chrome vorher](screenshots/before/chrome/diagnostics-history.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=history&contract=fixture.flow`

![Experten-Diagnose: Verlauf – chrome nachher](screenshots/after/chrome/diagnostics-history.png)

**Firefox vorher**, Route `#/diagnostics?tab=history&contract=fixture.flow`

![Experten-Diagnose: Verlauf – firefox vorher](screenshots/before/firefox/diagnostics-history.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=history&contract=fixture.flow`

![Experten-Diagnose: Verlauf – firefox nachher](screenshots/after/firefox/diagnostics-history.png)

</details>

<a id="diagnostics-publications"></a>

### Experten-Diagnose: Veröffentlichungen und Lücken

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=publications&contract=fixture.flow`

![Experten-Diagnose: Veröffentlichungen und Lücken – chrome vorher](screenshots/before/chrome/diagnostics-publications.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=publications&contract=fixture.flow`

![Experten-Diagnose: Veröffentlichungen und Lücken – chrome nachher](screenshots/after/chrome/diagnostics-publications.png)

**Firefox vorher**, Route `#/diagnostics?tab=publications&contract=fixture.flow`

![Experten-Diagnose: Veröffentlichungen und Lücken – firefox vorher](screenshots/before/firefox/diagnostics-publications.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=publications&contract=fixture.flow`

![Experten-Diagnose: Veröffentlichungen und Lücken – firefox nachher](screenshots/after/firefox/diagnostics-publications.png)

</details>

<a id="diagnostics-evidence"></a>

### Experten-Diagnose: Nachweis

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=evidence&contract=fixture.flow`

![Experten-Diagnose: Nachweis – chrome vorher](screenshots/before/chrome/diagnostics-evidence.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=evidence&contract=fixture.flow`

![Experten-Diagnose: Nachweis – chrome nachher](screenshots/after/chrome/diagnostics-evidence.png)

**Firefox vorher**, Route `#/diagnostics?tab=evidence&contract=fixture.flow`

![Experten-Diagnose: Nachweis – firefox vorher](screenshots/before/firefox/diagnostics-evidence.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=evidence&contract=fixture.flow`

![Experten-Diagnose: Nachweis – firefox nachher](screenshots/after/firefox/diagnostics-evidence.png)

</details>

<a id="diagnostics-commands"></a>

### Experten-Diagnose: Befehle

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/diagnostics?tab=commands&contract=fixture.flow`

![Experten-Diagnose: Befehle – chrome vorher](screenshots/before/chrome/diagnostics-commands.png)

**Chrome nachher**, Route `#/settings/diagnostics?tab=commands&contract=fixture.flow`

![Experten-Diagnose: Befehle – chrome nachher](screenshots/after/chrome/diagnostics-commands.png)

**Firefox vorher**, Route `#/diagnostics?tab=commands&contract=fixture.flow`

![Experten-Diagnose: Befehle – firefox vorher](screenshots/before/firefox/diagnostics-commands.png)

**Firefox nachher**, Route `#/settings/diagnostics?tab=commands&contract=fixture.flow`

![Experten-Diagnose: Befehle – firefox nachher](screenshots/after/firefox/diagnostics-commands.png)

</details>

<a id="draft-details"></a>

### Entwurf: Prüfung und Änderungen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/registry/drafts/9df38a8c-a589-4009-8bcb-c04ba9bfaf2b`

![Entwurf: Prüfung und Änderungen – chrome vorher](screenshots/before/chrome/draft-details.png)

**Chrome nachher**, Route `#/changes/drafts/6a4cb8fc-f6b1-46b8-9f51-95dd5f80a144`

![Entwurf: Prüfung und Änderungen – chrome nachher](screenshots/after/chrome/draft-details.png)

**Firefox vorher**, Route `#/registry/drafts/cf61ffd0-c61e-4942-92ff-4db317c50e44`

![Entwurf: Prüfung und Änderungen – firefox vorher](screenshots/before/firefox/draft-details.png)

**Firefox nachher**, Route `#/changes/drafts/e70a735f-19d1-4270-a01d-3ed010d49eac`

![Entwurf: Prüfung und Änderungen – firefox nachher](screenshots/after/firefox/draft-details.png)

</details>

<a id="template-inputs"></a>

### Vorlage: Eingänge

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Eingänge – chrome vorher](screenshots/before/chrome/template-inputs.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Eingänge – chrome nachher](screenshots/after/chrome/template-inputs.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Eingänge – firefox vorher](screenshots/before/firefox/template-inputs.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Eingänge – firefox nachher](screenshots/after/firefox/template-inputs.png)

</details>

<a id="template-outputs"></a>

### Vorlage: Ausgaben

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Ausgaben – chrome vorher](screenshots/before/chrome/template-outputs.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Ausgaben – chrome nachher](screenshots/after/chrome/template-outputs.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Ausgaben – firefox vorher](screenshots/before/firefox/template-outputs.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Ausgaben – firefox nachher](screenshots/after/firefox/template-outputs.png)

</details>

<a id="template-rules"></a>

### Vorlage: Benannte Regeln

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Benannte Regeln – chrome vorher](screenshots/before/chrome/template-rules.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Benannte Regeln – chrome nachher](screenshots/after/chrome/template-rules.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Benannte Regeln – firefox vorher](screenshots/before/firefox/template-rules.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Benannte Regeln – firefox nachher](screenshots/after/firefox/template-rules.png)

</details>

<a id="template-machine"></a>

### Vorlage: Ablauf

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Ablauf – chrome vorher](screenshots/before/chrome/template-machine.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Ablauf – chrome nachher](screenshots/after/chrome/template-machine.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: Ablauf – firefox vorher](screenshots/before/firefox/template-machine.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: Ablauf – firefox nachher](screenshots/after/firefox/template-machine.png)

</details>

<a id="template-json"></a>

### Vorlage: JSON für Experten

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome vorher**, Route `#/definitions/test.flow/1`

![Vorlage: JSON für Experten – chrome vorher](screenshots/before/chrome/template-json.png)

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: JSON für Experten – chrome nachher](screenshots/after/chrome/template-json.png)

**Firefox vorher**, Route `#/definitions/test.flow/1`

![Vorlage: JSON für Experten – firefox vorher](screenshots/before/firefox/template-json.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Vorlage: JSON für Experten – firefox nachher](screenshots/after/firefox/template-json.png)

</details>

<a id="device-guide"></a>

### Geräteführung: erster Temperaturvertrag

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/contracts/list/all`

![Geräteführung: erster Temperaturvertrag – chrome nachher](screenshots/after/chrome/device-guide.png)

**Firefox nachher**, Route `#/contracts/list/all`

![Geräteführung: erster Temperaturvertrag – firefox nachher](screenshots/after/firefox/device-guide.png)

</details>

<a id="takeover-confirmation"></a>

### Änderungen übernehmen: Bestätigung

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/contracts/view/bad_temperatur`

![Änderungen übernehmen: Bestätigung – chrome nachher](screenshots/after/chrome/takeover-confirmation.png)

**Firefox nachher**, Route `#/contracts/view/bad_temperatur`

![Änderungen übernehmen: Bestätigung – firefox nachher](screenshots/after/firefox/takeover-confirmation.png)

</details>

<a id="readiness-conditions"></a>

### Offene Bedingungen mit Lösungslink

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/`

![Offene Bedingungen mit Lösungslink – chrome nachher](screenshots/after/chrome/readiness-conditions.png)

**Firefox nachher**, Route `#/`

![Offene Bedingungen mit Lösungslink – firefox nachher](screenshots/after/firefox/readiness-conditions.png)

</details>

<a id="relations-draft"></a>

### Zusammenhänge: Entwurf

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/contracts/relations/graph`

![Zusammenhänge: Entwurf – chrome nachher](screenshots/after/chrome/relations-draft.png)

**Firefox nachher**, Route `#/contracts/relations/graph`

![Zusammenhänge: Entwurf – firefox nachher](screenshots/after/firefox/relations-draft.png)

</details>

<a id="template-new-version"></a>

### Neue Vorlagenversion mit Vertragsauswahl

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/templates/details/test.flow/1`

![Neue Vorlagenversion mit Vertragsauswahl – chrome nachher](screenshots/after/chrome/template-new-version.png)

**Firefox nachher**, Route `#/templates/details/test.flow/1`

![Neue Vorlagenversion mit Vertragsauswahl – firefox nachher](screenshots/after/firefox/template-new-version.png)

</details>

<a id="template-restart-permission"></a>

### Freigabe des manuellen Ablauf-Neustarts

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/templates/details/test.flow/2`

![Freigabe des manuellen Ablauf-Neustarts – chrome nachher](screenshots/after/chrome/template-restart-permission.png)

**Firefox nachher**, Route `#/templates/details/test.flow/2`

![Freigabe des manuellen Ablauf-Neustarts – firefox nachher](screenshots/after/firefox/template-restart-permission.png)

</details>

<a id="manual-restart-impact"></a>

### Ablauf-Neustart: Auswirkungen und Bestätigung

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/contracts/view/fixture.flow`

![Ablauf-Neustart: Auswirkungen und Bestätigung – chrome nachher](screenshots/after/chrome/manual-restart-impact.png)

**Firefox nachher**, Route `#/contracts/view/fixture.flow`

![Ablauf-Neustart: Auswirkungen und Bestätigung – firefox nachher](screenshots/after/firefox/manual-restart-impact.png)

</details>

<a id="manual-restart-result"></a>

### Ablauf-Neustart: gespeichertes Ergebnis

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/contracts/view/fixture.flow`

![Ablauf-Neustart: gespeichertes Ergebnis – chrome nachher](screenshots/after/chrome/manual-restart-result.png)

**Firefox nachher**, Route `#/contracts/view/fixture.flow`

![Ablauf-Neustart: gespeichertes Ergebnis – firefox nachher](screenshots/after/firefox/manual-restart-result.png)

</details>

<a id="versions-with-note"></a>

### Versionen mit Zeitpunkt, Rolle und Notiz

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/changes/versions`

![Versionen mit Zeitpunkt, Rolle und Notiz – chrome nachher](screenshots/after/chrome/versions-with-note.png)

**Firefox nachher**, Route `#/changes/versions`

![Versionen mit Zeitpunkt, Rolle und Notiz – firefox nachher](screenshots/after/firefox/versions-with-note.png)

</details>

<a id="rollback-confirmation"></a>

### Auf ältere Version zurücksetzen: Bestätigung

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/changes/versions`

![Auf ältere Version zurücksetzen: Bestätigung – chrome nachher](screenshots/after/chrome/rollback-confirmation.png)

**Firefox nachher**, Route `#/changes/versions`

![Auf ältere Version zurücksetzen: Bestätigung – firefox nachher](screenshots/after/firefox/rollback-confirmation.png)

</details>

<a id="source-move"></a>

### Quelle mit anderer Werteart umziehen

<details>
<summary>Vorher und nachher in beiden Browsern anzeigen</summary>

**Chrome nachher**, Route `#/sources/devices?item=0`

![Quelle mit anderer Werteart umziehen – chrome nachher](screenshots/after/chrome/source-move.png)

**Firefox nachher**, Route `#/sources/devices?item=0`

![Quelle mit anderer Werteart umziehen – firefox nachher](screenshots/after/firefox/source-move.png)

</details>
