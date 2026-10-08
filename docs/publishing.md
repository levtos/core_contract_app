# GHCR-Veröffentlichung und Supervisor-Packaging

Gültig für die vorhandene Platform Alpha 1; [Issue #5](https://github.com/levtos/core_contract_app/issues/5).
Ein erfolgreicher Image-Build allein belegt keine Installierbarkeit. Die
Konfiguration `core_contracts/config.yaml` verlangt diese öffentlichen Images:

| Supervisor-Architektur | Docker-Plattform | Image |
|---|---|---|
| amd64 | linux/amd64 | ghcr.io/levtos/amd64-core-contracts:1.0.0a1 |
| aarch64 | linux/arm64 | ghcr.io/levtos/aarch64-core-contracts:1.0.0a1 |

`{arch}` wird mit dem Supervisor-Namen ersetzt; `arm64-core-contracts` wäre
für die zweite Zeile falsch. Version und Image-Vorlage kommen aus der
Supervisor-Konfiguration; die Python-Paketversion muss dazu passen.

## Explizit veröffentlichen

1. Packaging-PR prüfen und mit vollständig grüner CI nach main mergen.
2. Die volle main-SHA ermitteln und den Workflow **Publish Supervisor images**
   (`.github/workflows/publish-images.yml`) ausdrücklich auf main starten.
   Das Pflichtfeld `expected_sha` muss exakt dem ausgewählten Commit entsprechen.
   Beispiel mit ersetztem SHA-Platzhalter:

   ```sh
   gh api repos/levtos/core_contract_app/commits/main --jq .sha
   gh workflow run publish-images.yml --repo levtos/core_contract_app --ref main -f expected_sha=REPLACE_WITH_FULL_MAIN_SHA
   ```

3. Der Workflow führt die **vollständige bestehende CI** als wiederverwendbaren
   Workflow aus. Nur wenn alle Jobs bestehen, lädt der Publish-Job die dort
   erzeugten Image-TARs. Er veröffentlicht exakt diese geprüften Bytes, ohne
   erneuten Build. Reguläre Push-/PR-CI baut weiterhin mit `push: false`.
4. Nur die Publish-Jobs erhalten `packages: write`; alle übrigen Jobs haben
   lediglich `contents: read`. Registry-Anmeldung erfolgt ausschließlich mit
   dem kurzlebigen `GITHUB_TOKEN`. Es gibt keine zusätzlichen PAT-Secrets,
   keinen Git-Tag, keinen GitHub-Release und kein HA-Deployment.
5. Ein vorhandener Versionstag wird nur akzeptiert, wenn seine Image-ID exakt
   dem geprüften Artefakt entspricht. Andernfalls bricht der Workflow ab.
   Für geänderte Images ist eine bewusst neue Version erforderlich; kein
   stilles Überschreiben von `1.0.0a1`.

## Öffentlich lesbar machen

Neue GHCR-Packages sind standardmäßig **privat**, auch bei einem öffentlichen
Quellrepository. Repository-Zugriff und Package-Sichtbarkeit sind getrennt.
Der erste Push kann deshalb erfolgreich sein, während die anschließenden
anonymen Pull-Jobs fehlschlagen.

Ein Package-Admin prüft für **beide** Pakete in GitHub:

1. Organisation **levtos → Packages → amd64-core-contracts** beziehungsweise
   **aarch64-core-contracts → Package settings**.
2. Unter **Danger Zone → Change visibility → Public** die Sichtbarkeit ändern.
   GitHub erlaubt danach keinen Wechsel zurück auf privat.
3. Falls der Push bereits an Berechtigungen scheitert: unter **Manage Actions
   access** das Repository `levtos/core_contract_app` mit Write-Zugriff freigeben.
   Die Workflow-Images tragen bereits das passende Source-Label; bei neu
   erzeugten Paketen wird der Workflow automatisch mit dem Repository verbunden.
4. Nach einer Sichtbarkeitskorrektur **nur die fehlgeschlagenen Jobs desselben
   Runs** erneut starten. So bleiben Commit, Images und Veröffentlichungsbelege
   unverändert:

   ```sh
   gh run rerun RUN_ID --failed --repo levtos/core_contract_app
   ```

Die Sichtbarkeit wird nicht durch einen undokumentierten API-Aufruf geändert.
Fehlt die erforderliche Package-Admin-Berechtigung, bleibt dies ein konkreter
manueller Schritt. **Erst zwei erfolgreiche anonyme Pull-Jobs belegen die
Distributionsfreigabe.** Bis dahin keine erfolgreiche Installierbarkeit behaupten.

Quellen:
[GitHub: Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[Package-Sichtbarkeit und Zugriffsrechte](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Reproduzierbarer Nachweis

`dev/image_package.py` prüft beim CI-Build und bei der Veröffentlichung:

- Supervisor-Version, Image-Namen und Architekturzuordnung aus config.yaml;
- tatsächliches Image-OS/CPU, `io.hass.type=app`, Version/Architektur und
  OCI-Source-/Revision-Labels;
- Python-Quelltext, Migrationen und Entrypoint anhand ihrer SHA-256-Hashes
  gegen den ausgecheckten Commit; vorhandenes Frontend, ausführbaren
  Entrypoint, installierte Python-Paketversion, Ports und Liveness-Healthcheck.

Der Docker-Build-Kontext ist der **Repository-Root**, das Dockerfile
`core_contracts/Dockerfile`. Er umfasst Backend/Lockfile, Frontend, Migrationen
und rootfs. Der Supervisor zieht bei gesetztem `image:` das fertige Image;
er baut diesen Repository-Checkout nicht lokal. Dockerfile-Buildargumente sind
`BUILD_VERSION`, `BUILD_ARCH` und `SOURCE_REVISION`. Die ersten beiden Namen
entsprechen den Supervisor-Buildargumenten. Der separate lokale Staging-Weg
in `dev/stage_app.py` bleibt erhalten.

Nach dem Push enthalten die Artefakte `published-amd64` und
`published-aarch64` je einen JSON-Beleg mit Image-Tag, Image-ID, Registry-Digest,
getestetem Commit, Run-ID, Package-URL, Erstellungszeit und Sichtbarkeit beim Push.

Die unabhängigen Pull-Jobs bekommen **keine Registry-Anmeldung**. Das Skript
erzeugt jeweils eine leere temporäre Docker-Konfiguration ohne Credential-Helper
und führt einen echten `docker pull --platform` aus. Danach werden Digest,
Image-ID, Architektur, Labels und Inhalt erneut mit dem CI-Beleg verglichen.
Der amd64-Job führt zusätzlich den bestehenden isolierten Container-Lifecycle-
Smoke mit dem anonym gezogenen Image aus. aarch64-Inhaltsprüfungen laufen unter
QEMU. Das ist keine reale Supervisor-/HA-Abnahme.

Commit, Workflow-Link, Digests und das Ergebnis beider anonymen Pulls gehören
in den Abschlussnachweis des Issues. Ein alter grüner Build oder ein
authentifizierter Pull ersetzt diesen Nachweis nicht.

## Fehler unterscheiden

| Beobachtung | Belastbare Aussage / nächster Schritt |
|---|---|
| Bisher nur `push: false`, kein Publikationsnachweis | CI hat nichts in GHCR veröffentlicht; einen expliziten Publish-Run ausführen. |
| Package-API 403 wegen fehlendem `read:packages` | Die verwendete Identität darf diese Information nicht lesen. Daraus folgt keine Aussage zur Existenz. |
| Package-API 404 | Nicht vorhanden **oder** für diese Identität unsichtbar; allein kein Nichtexistenzbeweis. |
| Authentifizierter Push erfolgreich, Package privat, anonymer Pull DENIED | Sichtbarkeit auf Public korrigieren; ein Supervisor-Login ist nicht die vorgesehene Lösung. |
| Öffentliches Package erreichbar, Versionsmanifest fehlt | Versionstag und config.yaml abgleichen; das konkrete Tag fehlt oder ist falsch. |
| Push DENIED trotz `packages: write` | Package-Actions-Zugriff und Organisationsregeln prüfen, keinen zusätzlichen PAT als Standardlösung einführen. |
| Pull gelingt, Architektur/Revision/ID stimmen nicht | Veröffentlichung nicht abgenommen; falsches Image oder Tag-Zuordnung untersuchen. |

Die tatsächliche Erstdiagnose und der endgültige Veröffentlichungsstand stehen
im Issue; diese Anleitung erklärt das Verfahren und behauptet keine bereits
erteilte Live-Freigabe.
