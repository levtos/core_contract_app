// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import App from './App.svelte';
import SetupWizard from './SetupWizard.svelte';
import type { SetupStatus } from './setup';

vi.mock('./Admin.svelte', () => import('../test/StubAdmin.svelte'));

const initial: SetupStatus = {phase:'welcome',authority:'unconfigured',database_configured:false,onboarding_complete:false,database:null,csrf_token:'ephemeral-csrf',installation_id:null,error:'',restart_required:false};
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if(component) await unmount(component); component=undefined; document.body.innerHTML=''; vi.unstubAllGlobals(); });
function backend(status=initial) {
  const fetch=vi.fn(async (url:string) => new Response(JSON.stringify(url.endsWith('/status') ? status : url.endsWith('/bridge') ? {state:'missing_or_restart_pending'} : url.endsWith('/provision') ? {script:'reviewable-test-script'} : {accepted:true})));
  vi.stubGlobal('fetch',fetch); return fetch;
}
function click(text:string) { const button=[...document.querySelectorAll('button')].find(node => node.textContent?.includes(text)); expect(button).toBeDefined(); button!.click(); }
it('reload after DB initialization resumes the unfinished Bridge step',async () => {
  backend({...initial,phase:'completed',authority:'wizard',database_configured:true});
  component=mount(App,{target:document.body});
  await vi.waitFor(() => expect(document.body.textContent).toContain('Home-Assistant-Bridge'));
  expect(document.querySelector('h1')?.textContent).toBe('Core Contracts einrichten');
  expect(document.body.textContent).toContain('SELF-INSTALL-01');
});
it('database outage is not presented as an identity rejection',async () => {
  backend({...initial,phase:'connecting',authority:'wizard',database_configured:true,error:'database_connection_failed'});
  component=mount(App,{target:document.body});
  await vi.waitFor(() => expect(document.body.textContent).toContain('PostgreSQL nicht erreichbar'));
  expect(document.body.textContent).not.toContain('Identität oder Schema abgewiesen');
});
it('completed onboarding opens Administration after DB recovery but manual setup stays open',async () => {
  const status={...initial,phase:'connecting' as SetupStatus['phase'],authority:'wizard',database_configured:true,onboarding_complete:true};
  backend(status);
  component=mount(App,{target:document.body});
  await vi.waitFor(() => expect(document.body.textContent).toContain('Core Contracts einrichten'));
  status.phase='completed';
  // Polling performs the same recovery refresh without changing configuration.
  await vi.waitFor(() => expect(document.body.textContent).toContain('Administration'),{timeout:5000});
  click('Einrichtung prüfen');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Bestehende Identität wird beibehalten'));
  expect(document.body.textContent).not.toContain('Einrichtung prüfen');
});
it('fresh installation automatically renders guided UI before ordinary API',async () => {
  const fetch=backend();
  component=mount(App,{target:document.body});
  await vi.waitFor(() => expect(document.body.textContent).toContain('Core Contracts einrichten'));
  expect(document.body.textContent).toContain('Willkommen');
  expect(fetch.mock.calls.every(([url]) => url.includes('/setup/'))).toBe(true);
});
it('validates connection, moves forward/back and displays script rather than JSON editor',async () => {
  const fetch=backend();
  component=mount(SetupWizard,{target:document.body,props:{initial,oncomplete:vi.fn()}});
  await tick(); click('Verbindung einrichten'); await tick();
  const inputs=[...document.querySelectorAll<HTMLInputElement>('input')];
  inputs[0].value='postgres-test'; inputs[0].dispatchEvent(new Event('input',{bubbles:true})); await tick();
  await vi.waitFor(() => expect([...document.querySelectorAll('button')].find(node => node.textContent === 'Weiter')?.disabled).toBe(false));
  click('Weiter');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Einrichtungsskript und geheimer Import'));
  expect(document.querySelector('textarea')?.value).toBe('reviewable-test-script');
  expect(document.querySelector('input[type=password]')).not.toBeNull();
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/provision'))).toBe(true);
  click('Zurück'); await tick(); expect(document.body.textContent).toContain('PostgreSQL verbinden');
});
it('existing Alpha setup skips DB provisioning and exposes honest Bridge blocker',async () => {
  const status={...initial,phase:'completed' as const,authority:'supervisor',database_configured:true,installation_id:'existing-id'};
  const fetch=backend(status);
  component=mount(SetupWizard,{target:document.body,props:{initial:status,oncomplete:vi.fn()}});
  await vi.waitFor(() => expect(document.body.textContent).toContain('Bestehende Identität wird beibehalten'));
  click('Datenbankschritte überspringen'); await tick();
  expect(document.body.textContent).toContain('Release-Blocker SELF-INSTALL-01');
  expect(document.body.textContent).toContain('Legacy-Integration vorübergehend');
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/provision') || url.endsWith('/connect'))).toBe(false);
});
