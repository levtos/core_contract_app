import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import RegistryPage from '@/features/registry/RegistryPage';
import { installFakeApi, makeDraft, sampleConfig, type FakeApi } from '../../../test/fakeApi';
import { idleLive } from '../../../test/harness';
import { LiveProvider } from '@/lib/live-context';
import { DraftBar, DraftPicker } from './DraftBar';
import { useWorkingDocument, WorkingDocumentProvider } from './WorkingDocument';

/**
 * T1B-02: unsaved edits must survive every way of "opening a draft" that targets
 * the draft that is already open, and must never be dropped silently for another one.
 */
const user = userEvent.setup();

function Probe() {
  const doc = useWorkingDocument();
  const location = useLocation();
  return (
    <div>
      <button onClick={() => doc.edit((c) => ({ ...c, marker: 'lokal' }))}>edit</button>
      <button onClick={doc.undo}>undo</button>
      <button onClick={doc.redo}>redo</button>
      <output data-testid="doc">{JSON.stringify({ id: doc.draft?.draft_id ?? null, dirty: doc.dirty, marker: (doc.config as { marker?: string } | null)?.marker ?? null, undo: doc.canUndo, redo: doc.canRedo, loc: location.pathname })}</output>
    </div>
  );
}
const read = () => JSON.parse(screen.getByTestId('doc').textContent!) as { id: string | null; dirty: boolean; marker: string | null; undo: boolean; redo: boolean; loc: string };

function mount(api: FakeApi, ui: React.ReactNode) {
  void api;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/changes/drafts']}>
        <LiveProvider store={idleLive()}>
          <WorkingDocumentProvider validateDebounceMs={3_600_000}>
            <Probe />
            <DraftBar />
            <Routes>
              <Route path="/changes/drafts" element={ui} />
              <Route path="/changes/drafts/:id" element={ui} />
              <Route path="*" element={<p>andere Seite</p>} />
            </Routes>
          </WorkingDocumentProvider>
        </LiveProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const twoDrafts = () => installFakeApi({ drafts: [makeDraft('a', sampleConfig(), { display_name: 'Alpha' }), makeDraft('b', sampleConfig(), { display_name: 'Beta' })] });

describe('re-selecting the open draft', () => {
  it('through the picker keeps the local change, the undo history and shows no discard dialog', async () => {
    mount(twoDrafts(), <DraftPicker open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Alpha/ }));
    expect(read()).toMatchObject({ id: 'a', dirty: false });
    await user.click(screen.getByText('edit'));
    expect(read()).toMatchObject({ dirty: true, marker: 'lokal', undo: true });

    await user.click(screen.getByRole('button', { name: /Alpha/ })); // pick the very same draft again
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal', undo: true });
    // undo history is intact: undo restores the saved state, redo brings the edit back
    await user.click(screen.getByText('undo'));
    expect(read()).toMatchObject({ dirty: false, marker: null, redo: true });
    await user.click(screen.getByText('redo'));
    expect(read()).toMatchObject({ dirty: true, marker: 'lokal' });
  });

  it('through "Bearbeiten" in the Registry Studio list also keeps everything and still navigates', async () => {
    mount(twoDrafts(), <RegistryPage />);
    const alpha = async () => (await screen.findByRole('link', { name: 'Alpha' })).closest('li')!;
    await user.click(within(await alpha()).getByRole('button', { name: /Bearbeiten/ }));
    await waitFor(() => expect(read()).toMatchObject({ id: 'a', loc: '/changes/drafts/a' }));
    await user.click(screen.getByText('edit'));
    await user.click(within(await alpha()).getByRole('button', { name: /Bearbeiten/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal', undo: true });
  });
});

describe('opening another draft', () => {
  it('asks first when there are unsaved changes; cancel keeps them, confirm switches', async () => {
    mount(twoDrafts(), <DraftPicker open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Alpha/ }));
    await user.click(screen.getByText('edit'));

    await user.click(screen.getByRole('button', { name: /Beta/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Beta/)).toBeInTheDocument();
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal' }); // nothing happened yet

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal', undo: true });

    await user.click(screen.getByRole('button', { name: /Beta/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Verwerfen und wechseln' }));
    expect(read()).toMatchObject({ id: 'b', dirty: false, marker: null, undo: false });
  });

  it('opens immediately when nothing would be lost', async () => {
    mount(twoDrafts(), <DraftPicker open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Alpha/ }));
    await user.click(screen.getByRole('button', { name: /Beta/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(read().id).toBe('b');
  });

  it('creating a new draft while edits are unsaved does not discard them silently', async () => {
    const api = twoDrafts();
    mount(api, <RegistryPage />);
    await user.click(within((await screen.findByRole('link', { name: 'Alpha' })).closest('li')!).getByRole('button', { name: /Bearbeiten/ }));
    await waitFor(() => expect(read().id).toBe('a'));
    await user.click(screen.getByText('edit'));

    await user.click(screen.getAllByRole('button', { name: /Neuer Entwurf/ })[0]!);
    const create = await screen.findByRole('dialog', { name: "Neuer Entwurf" });
    await user.click(within(create).getByRole('radio', { name: "Leere Konfiguration" }));
    await user.click(within(create).getByRole('button', { name: "Entwurf anlegen" }));
    const ask = await screen.findByRole('alertdialog');
    expect(api.drafts.size).toBe(3); // the new draft exists on the server ...
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal' }); // ... but the edits are untouched
    await user.click(within(ask).getByRole('button', { name: 'Abbrechen' }));
    expect(read()).toMatchObject({ id: 'a', dirty: true, marker: 'lokal', undo: true });
  });
});
