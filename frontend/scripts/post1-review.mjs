/** Only the eight requested Firefox correction views, using the existing real-engine harness. */
import { expect } from '@playwright/test';

export async function post1Pages(page, server, browser, { visit, capture, manifest }) {
  if (browser !== 'firefox') throw new Error('Post1 proof is Firefox only');
  await page.clock.setFixedTime(new Date('2026-10-17T10:01:05Z'));
  const photo = (name, reason) => capture(page, 'post1', browser, name, reason);
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(`${server.url}api/v1/${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  await visit(page, server.url, '/');
  await expect(page.getByRole('link', { name: '3 gesund', exact: true })).toBeVisible();
  await photo('overview', 'B1: drei serverseitig gesunde Verträge, einschließlich optionalem unbekanntem Zusatzwert');
  await page.getByRole('link', { name: '3 gesund', exact: true }).click();
  const table = page.getByRole('table', { name: 'Verträge', exact: true });
  await expect(table.getByRole('row')).toHaveCount(4);
  const optional = table.getByRole('row').filter({ hasText: 'Fensterzeit – Zusatzwert fehlt' });
  await expect(optional.getByText('Gesund', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Zustand', exact: true })).toHaveValue('healthy');
  await photo('list-healthy', 'B1: dieselben drei Verträge im Gesund-Filter; Feld unbekannt ändert die Serverkategorie nicht');
  await page.getByRole('combobox', { name: 'Zustand', exact: true }).selectOption('all');
  await expect(table.getByText('14,3 min', { exact: true })).toBeVisible();
  await expect(table.getByText('21,3 °C', { exact: true })).toBeVisible();
  await photo('list-rounded', 'B4: Minuten und Temperatur mit einer Nachkommastelle');
  await visit(page, server.url, '/sources/devices');
  await expect(page.getByRole('button', { name: 'Quelle hinzufügen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerät aus Home Assistant hinzufügen', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Temperatur im Testzimmer source.temperature/ })).toBeVisible();
  await photo('sources-list', 'B5: Namen über kleinen Kennungen, Du-Form, ein Hinzufügen-Kopfknopf');
  await visit(page, server.url, '/sources/devices?item=1');
  await expect(page.getByText('Aktualität', { exact: true })).toHaveCount(1);
  await expect(page.getByText('= 15 Minuten', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Erreichbarkeitsquelle/)).toHaveCount(0);
  await photo('source-freshness', 'B6: einmal Aktualität, erforderliches Intervall mit Minutenhilfe, keine unzutreffende Erreichbarkeitspflicht');
  await visit(page, server.url, '/contracts/view/test.window');
  await expect(page.getByText(/Eingang „Fenster im Testzimmer“: Der zuletzt gemessene Wert ist 1 min alt/)).toBeVisible();
  const chart = page.getByRole('img', { name: 'Verlauf: Wert', exact: true });
  await expect(chart.locator('polyline[data-interpolation="step"]')).toHaveCount(1);
  await expect(chart.getByText('Ja', { exact: true })).toBeVisible();
  await expect(chart.getByText('Nein', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Warum?', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await photo('contract-boolean-history', 'B7/B8: volle Diagrammbreite, Ja/Nein-Stufen und betroffener Eingang mit Alter');

  const draft = (await call('registry/drafts'))[0];
  const invalid = structuredClone(draft.config);
  invalid.contracts[0].inputs[0].ref = 'source.missing';
  const changed = await call(`registry/drafts/${draft.draft_id}`, 'PUT', { draft_version: draft.draft_version, config: invalid, display_name: 'Entwurf mit fehlender Quelle' });
  await visit(page, server.url, `/changes/drafts/${draft.draft_id}`);
  await expect(page.locator('header').getByLabel('Anzahl der Änderungen')).toContainText('erst nach Fehlerkorrektur');
  await expect(page.locator('header').getByLabel('Anzahl der Änderungen')).not.toContainText('…');
  await expect(page.getByRole('list', { name: 'Fehler im Entwurf', exact: true })).toBeVisible();
  await photo('draft-invalid', 'B3/B9: endgültige Fehlerprüfung zeigt Strich statt endlosem Laden und verständliche Fehlerliste');

  await page.getByRole('textbox', { name: 'Entwurf-Name', exact: true }).fill('Meine lokale Änderung');
  const remote = structuredClone(changed.config);
  remote.contracts[0].display_name = 'Änderung aus der zweiten Sitzung';
  await call(`registry/drafts/${draft.draft_id}`, 'PUT', { draft_version: changed.draft_version, config: remote, display_name: 'Anderer gespeicherter Stand' });
  await page.getByLabel('Weitere Entwurfsaktionen', { exact: true }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'Versionskonflikt beim Speichern', exact: true });
  await expect(conflict.getByRole('button', { name: 'Gespeicherten Stand laden', exact: true })).toBeInViewport();
  await expect(conflict.getByText(/deine lokalen Änderungen/)).toBeVisible();
  await photo('save-conflict', 'B9: gespeicherten Stand laden, Du-Form, kein Übernehmen beim Speichern');
  manifest.checks.push({ browser, check: 'B1/B3/B4/B5/B6/B7/B8/B9 targeted UI assertions', result: 'passed', syntheticClock: '2026-10-17T10:01:05Z', viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })) });
}
