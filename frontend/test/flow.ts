import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import { gui } from './gui';

/** Application-level user flows, shared by the in-memory and the real-engine tests. */
export function flow(user: UserEvent) {
  const steps = gui(user);

  const go = async (hash: string) => {
    window.location.hash = hash;
    await waitFor(() => expect(window.location.hash).toBe(hash));
  };

  const createDraft = async (name: string, origin: 'Leere Konfiguration' | 'Einlesen (JSON)', json?: string) => {
    await user.click((await screen.findAllByRole('button', { name: /Neuer Entwurf|Ersten Entwurf anlegen/ }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: "Neuer Entwurf" });
    await user.type(within(dialog).getByLabelText("Name (freiwillig)"), name);
    await user.click(within(dialog).getByRole('radio', { name: origin }));
    if (json) {
      await user.click(within(dialog).getByLabelText('oder JSON einfügen'));
      await user.paste(json);
    }
    await user.click(within(dialog).getByRole('button', { name: "Entwurf anlegen" }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: "Neuer Entwurf" })).toBeNull());
  };

  const saveButton = () => screen.getAllByRole('button', { name: /Speichern/ })[0]!;

  /** Builds the complete Alpha-4 example registry in the open (empty) draft, by operating controls only. */
  const buildExampleRegistry = async () => {
    // Dependencies, sources, bindings
    await go('#/sources?tab=dependencies');
    await user.click(await screen.findByRole('button', { name: "Abhängigkeit hinzufügen" }));
    await steps.type(screen.getByLabelText("Abhängigkeit-ID"), 'dep.test');
    await user.click(screen.getByRole('tab', { name: "Quellen" }));
    for (const [id, key] of [['source.a', 'physical.a'], ['source.b', 'physical.b']] as const) {
      await user.click(await screen.findByRole('button', { name: "Quelle hinzufügen" }));
      await steps.type(screen.getByLabelText("Quelle-ID"), id);
      await steps.type(screen.getByLabelText('Physischer Schlüssel'), key);
    }
    await user.click(screen.getByRole('tab', { name: "Verknüpfungen" }));
    for (const [id, source, entity] of [['binding.a', 'source.a', 'sensor.example_1'], ['binding.b', 'source.b', 'input_boolean.cc_alpha_test_b']] as const) {
      await user.click(await screen.findByRole('button', { name: "Verknüpfung hinzufügen" }));
      await steps.type(screen.getByLabelText("Verknüpfung-ID"), id);
      await user.selectOptions(screen.getByLabelText('Quelle'), source);
      await steps.type(screen.getByLabelText(/^HA-Entität \*/), entity);
    }

    // Definitions
    const defs: [string, (base: string) => Promise<void>][] = [
      ['test.truth', async () => {}],
      ['test.either', steps.buildEither],
      ['test.condition', steps.buildCondition],
      ['test.timed', steps.buildTimed],
      ['test.flow', steps.buildFlow],
    ];
    for (const [index, [typeId, build]] of defs.entries()) {
      await go('#/definitions');
      await user.click(await screen.findByRole('button', { name: /Neue Vorlage/ }));
      const dialog = await screen.findByRole('dialog', { name: "Neue Vorlage" });
      await steps.type(within(dialog).getByLabelText('Typ-ID'), typeId);
      await user.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
      await screen.findByRole('tab', { name: 'Allgemein' });
      await build(`/definitions/${index}`);
    }

    // Contract instances
    const contracts: [string, string, string[]][] = [
      ['fixture.left', 'test.truth@1', ['source.a']],
      ['fixture.right', 'test.truth@1', ['source.b']],
      ['fixture.either', 'test.either@1', ['fixture.left', 'fixture.right']],
      ['fixture.condition', 'test.condition@1', ['fixture.either']],
      ['fixture.timed', 'test.timed@1', ['fixture.condition']],
      ['fixture.flow', 'test.flow@1', ['fixture.timed']],
    ];
    for (const [id, type, refs] of contracts) {
      await go('#/contracts');
      await user.click(await screen.findByRole('button', { name: /Neue Instanz/ }));
      const dialog = await screen.findByRole('dialog', { name: "Neuer Vertrag" });
      await steps.type(within(dialog).getByLabelText("Vertrag-ID"), id);
      await user.selectOptions(within(dialog).getByLabelText('Typ & Version'), type);
      await user.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
      await user.click(await screen.findByRole('tab', { name: 'Konfiguration' }));
      const selects = await screen.findAllByLabelText('Referenz');
      for (const [i, ref] of refs.entries()) await user.selectOptions(selects[i]!, ref);
    }
  };

  /** Activation through the real dialog, after the debounced server validation has accepted the draft. */
  const activateOpenDraft = async (draftId: string) => {
    await go(`#/registry/drafts/${draftId}`);
    const button = await screen.findByRole('button', { name: /Übernehmen/ });
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 65_000 });
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: "Konfiguration übernehmen" });
    await user.click(await within(dialog).findByRole('checkbox', { name: /Auswirkungen geprüft/ }, { timeout: 65_000 }));
    await user.click(within(dialog).getByRole('button', { name: "Jetzt übernehmen" }));
    return dialog;
  };

  return { ...steps, go, createDraft, saveButton, buildExampleRegistry, activateOpenDraft };
}
