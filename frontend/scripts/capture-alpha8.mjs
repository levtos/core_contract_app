/** Run only against dev/workbench_demo.py --alpha8; real UI/API, synthetic data. */
import { firefox, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.MIMIR_REVIEW_URL ?? 'http://127.0.0.1:8099';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('local review harness required');
const output = path.resolve(process.argv[2] ?? '../docs/alpha8/screenshots');
await mkdir(output, { recursive: true });
const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1568, height: 710 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(base + '/#/');
  await expect(page.getByText(/Home Assistant getrennt seit/)).toBeVisible();
  await expect(page.getByText(/1 Werte ohne Frist gelten unverändert weiter/)).toBeVisible();
  await page.screenshot({ path: path.join(output, '01-mimir-kopf.png') });
  await page.getByRole('heading', { name: 'Konfiguration unvollständig', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '02-uebersicht.png') });

  await page.goto(base + '/#/contracts/view/test.zuordnung');
  await expect(page.getByTestId('value-value')).toHaveText('noch nicht zugeordnet');
  await expect(page.getByRole('heading', { name: 'Konfiguration unvollständig', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, '03-vollstaendigkeit.png') });

  await page.goto(base + '/#/contracts/view/test.temperaturbereich');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.getByText('im Entwurf gespeichert', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Konfiguration', exact: true }).click();
  const lower = page.getByLabel(/Untere Temperaturgrenze/);
  await expect(lower).toBeEnabled();
  await lower.fill('20');
  await page.getByText('Deine Änderung gilt erst, wenn du den Entwurf übernimmst.', { exact: true }).scrollIntoViewIfNeeded();
  await expect(lower).toHaveValue('20');
  await lower.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await expect(page.getByText('1 Änderung', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, '04-vertragsparameter.png') });
  const active = await (await page.request.get(base + '/api/v1/registry/active')).json();
  const config = active.config ?? active;
  expect(config.contracts.find(contract => contract.contract_id === 'test.temperaturbereich').parameters.untere_grenze).toBe(19);
  expect(errors).toEqual([]);
  await writeFile(path.join(output, 'capture.json'), JSON.stringify({ browser: 'Firefox', viewport: { width: 1568, height: 710 }, source: 'dev/workbench_demo.py --alpha8', externalSystems: false, parameterEdited: 20, activeParameterUnchanged: 19, pageErrors: errors, capturedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('Firefox 1568x710: 4 captures; parameter edit remains draft-only; no page errors.');
} finally {
  await browser.close();
}
