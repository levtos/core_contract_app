import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { WorkingDocumentProvider, useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { installFakeApi, makeDraft, reply, sampleConfig, type FakeApi } from '../../test/fakeApi';
import { wrap } from '../../test/harness';

function Probe({ fake }: { fake: FakeApi }) {
  const doc = useWorkingDocument();
  const [result, setResult] = useState('');
  return <>
    <button onClick={() => doc.open(fake.drafts.get('a')!)}>Öffnen A</button>
    <button onClick={() => doc.open(fake.drafts.get('b')!)}>Öffnen B</button>
    <button onClick={() => doc.setAt('/marker', 'neu')}>Ändern</button>
    <button onClick={async () => { await Promise.all([doc.ensureDraft(), doc.ensureDraft()]); setResult('fertig'); }}>Parallel beginnen</button>
    <button onClick={async () => { try { await doc.prepareActivation(); setResult('bereit'); } catch (error) { setResult((error as Error).message); } }}>Vorbereiten</button>
    <output data-testid="owner">{doc.draft?.draft_id}</output>
    <output data-testid="result">{result}</output>
  </>;
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

it('coalesces two simultaneous editing requests into one draft', async () => {
  const fake = installFakeApi();
  wrap(<WorkingDocumentProvider><Probe fake={fake} /></WorkingDocumentProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Parallel beginnen' }));
  await screen.findByText('fertig');
  expect(fake.drafts.size).toBe(1);
  expect(fake.calls.filter(call => call.path === 'registry/drafts' && call.method === 'POST')).toHaveLength(1);
});

it.each(['switch', 'edit'])('rejects a late review candidate after a concurrent %s', async action => {
  const user = userEvent.setup();
  const fake = installFakeApi({ drafts: [makeDraft('a', sampleConfig()), makeDraft('b', sampleConfig())] });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  fake.routes.push({ match: /^registry\/drafts\/a$/, method: 'GET', respond: async () => { await gate; return reply(200, fake.drafts.get('a')); } });
  wrap(<WorkingDocumentProvider validateDebounceMs={3_600_000}><Probe fake={fake} /></WorkingDocumentProvider>);
  await user.click(screen.getByRole('button', { name: 'Öffnen A' }));
  await user.click(screen.getByRole('button', { name: 'Vorbereiten' }));
  await waitFor(() => expect(fake.calls.some(call => call.path === 'registry/drafts/a' && call.method === 'GET')).toBe(true));
  await user.click(screen.getByRole('button', { name: action === 'switch' ? 'Öffnen B' : 'Ändern' }));
  release();
  await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('Der Entwurf hat sich während der Vorbereitung geändert.'));
  expect(screen.getByTestId('owner')).toHaveTextContent(action === 'switch' ? 'b' : 'a');
  expect(fake.revisions).toHaveLength(0);
});
