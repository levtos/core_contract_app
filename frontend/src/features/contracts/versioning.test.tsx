import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import example from '../../../../docs/alpha4/example-registry.json';
import { useWorkingDocument, WorkingDocumentProvider } from '@/features/authoring/WorkingDocument';
import { clone, type JsonObject } from '@/lib/json';
import type { Draft } from '@/lib/types';
import { installFakeApi, makeDraft } from '../../../test/fakeApi';
import DefinitionDetailPage from './DefinitionDetailPage';

const user = userEvent.setup();
const registry = () => clone(example) as unknown as JsonObject;

function Harness({ draft, path }: { draft: Draft; path: string }) {
  function Open() {
    const doc = useWorkingDocument();
    const location = useLocation();
    return (
      <>
        <button onClick={() => doc.open(draft)}>open-draft</button>
        <output data-testid="loc">{location.pathname}</output>
        <output data-testid="cfg">{JSON.stringify(doc.config)}</output>
      </>
    );
  }
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <WorkingDocumentProvider validateDebounceMs={3_600_000}>
          <Open />
          <Routes>
            <Route path="/definitions/:typeId/:version" element={<DefinitionDetailPage />} />
            <Route path="/definitions" element={<p>Liste</p>} />
          </Routes>
        </WorkingDocumentProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const config = () => JSON.parse(screen.getByTestId('cfg').textContent!) as { definitions: JsonObject[]; contracts: JsonObject[] };

describe('definition versions are immutable once activated', () => {
  it('locks an activated version, keeps editorial fields editable and creates a new version with instance migration', async () => {
    const api = installFakeApi({ revisions: [{ revision: 3, config: registry(), checksum: 'c'.repeat(64), created_at: 'x' }], drafts: [makeDraft('d1', registry())] });
    render(<Harness draft={api.drafts.get('d1') as unknown as Draft} path="/definitions/test.truth/1" />);
    await user.click(screen.getByText('open-draft'));
    await screen.findByText(/Aktivierte Version – semantisch unveränderlich/);

    // Logic is locked ...
    await user.click(screen.getByRole('tab', { name: /Ausgaben/ }));
    const operator = (await screen.findAllByRole('combobox', { name: /^Operator/ }))[0]!;
    expect(operator).toBeDisabled();
    // ... editorial text is not.
    await user.click(screen.getByRole('tab', { name: 'Allgemein' }));
    const name = screen.getByLabelText(/Anzeigename/);
    expect(name).toBeEnabled();
    await user.type(name, 'Wahrheit');
    expect(config().definitions.find((d) => d.type_id === 'test.truth')).toMatchObject({ display_name: 'Wahrheit', type_version: 1 });

    // New version: copy with version 2, selected instances migrate, others stay on v1.
    await user.click(screen.getByRole('button', { name: /Neue Version/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'fixture.right' })); // keep fixture.right on v1
    await user.click(within(dialog).getByRole('button', { name: 'Version anlegen' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/definitions/test.truth/2'));
    const next = config();
    const versions = next.definitions.filter((d) => d.type_id === 'test.truth').map((d) => d.type_version);
    expect(versions).toEqual([1, 2]);
    expect(next.contracts.find((c) => c.contract_id === 'fixture.left')!.type_version).toBe(2);
    expect(next.contracts.find((c) => c.contract_id === 'fixture.right')!.type_version).toBe(1);
    // The old version's semantics are untouched.
    const v1 = next.definitions.find((d) => d.type_id === 'test.truth' && d.type_version === 1)!;
    expect(v1.outputs).toEqual((registry().definitions as JsonObject[]).find((d) => d.type_id === 'test.truth')!.outputs);
  });

  it('a new, never activated version is editable', async () => {
    const api = installFakeApi({ revisions: [{ revision: 1, config: registry(), checksum: 'c'.repeat(64), created_at: 'x' }] });
    const cfg = registry();
    const defs = cfg.definitions as JsonObject[];
    defs.push({ ...clone(defs[0]!), type_version: 2 });
    api.drafts.set('d2', makeDraft('d2', cfg));
    render(<Harness draft={api.drafts.get('d2') as unknown as Draft} path="/definitions/test.truth/2" />);
    await user.click(screen.getByText('open-draft'));
    await user.click(await screen.findByRole('tab', { name: /Ausgaben/ }));
    expect((await screen.findAllByRole('combobox', { name: /^Operator/ }))[0]).toBeEnabled();
    expect(screen.queryByText(/Aktivierte Version/)).toBeNull();
  });
});
