import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import example from '../../../docs/alpha4/example-registry.json';
import { newDefinition } from '@/features/authoring/model';
import { type JsonObject } from '@/lib/json';
import { caps, Stateful, wrap } from '../../test/harness';
import { DefinitionEditor } from './DefinitionEditor';

/**
 * Acceptance criteria 1-3: the Alpha-4 example definitions are rebuilt purely by
 * operating the graphical editors (no JSON), and the result equals the example.
 */
const user = userEvent.setup();
const defs = (example as unknown as { definitions: JsonObject[] }).definitions;
const exampleDef = (id: string) => defs.find((d) => d.type_id === id)!;
const base = '/definitions/0';

const node = (pointer: string) => {
  const el = document.querySelector(`[data-pointer="${pointer}"]`);
  if (!el) throw new Error(`Knoten ${pointer} nicht gefunden`);
  return el as HTMLElement;
};
const setOp = async (pointer: string, op: string) => {
  await user.selectOptions(within(node(pointer)).getAllByRole('combobox', { name: /^Operator/ })[0]!, op);
};
const first = (pointer: string, label: string | RegExp) => within(node(pointer)).getAllByLabelText(label)[0]!;
const type = async (el: HTMLElement, text: string) => {
  await user.clear(el);
  await user.type(el, text);
};

function mount(id: string) {
  let current: JsonObject = newDefinition(id, 1);
  wrap(
    <Stateful initial={current} onValue={(v) => (current = v)}>
      {(value, set) => <DefinitionEditor value={value} onChange={set} pointer={base} caps={caps} locked={false} />}
    </Stateful>,
  );
  return () => current;
}

describe('the example definitions can be rebuilt with the graphical editor only', { timeout: 60_000 }, () => {
  it('test.condition: nested AND / NOT / literal / compare / formula', async () => {
    const result = mount('test.condition');
    await user.click(screen.getByRole('tab', { name: /Ausgaben/ }));
    const root = `${base}/outputs/value`;
    await setOp(root, 'and');
    await user.click(within(node(root)).getAllByRole('button', { name: 'Operand' })[0]!);
    await setOp(`${root}/args/1`, 'not');
    await setOp(`${root}/args/1/args/0`, 'literal'); // bool false (default)
    await setOp(`${root}/args/2`, 'compare');
    await user.selectOptions(first(`${root}/args/2`, 'Vergleich'), 'gt');
    const formula = `${root}/args/2/left`;
    await setOp(formula, 'formula');
    await type(first(`${formula}/args/0`, 'Wert'), '1');
    await user.click(within(node(formula)).getAllByRole('button', { name: 'Argument' })[0]!);
    await setOp(`${formula}/args/1`, 'literal');
    await user.selectOptions(first(`${formula}/args/1`, 'Typ'), 'number');
    await type(first(`${formula}/args/1`, 'Wert'), '2');
    await type(first(`${root}/args/2/right`, 'Wert'), '2');
    expect(result()).toEqual(exampleDef('test.condition'));
  });

  it('test.either: second input, fusion with explicit strategy', async () => {
    const result = mount('test.either');
    await user.click(screen.getByRole('tab', { name: /Eingänge/ }));
    await user.click(screen.getByRole('button', { name: 'Eingang' }));
    await type(screen.getAllByLabelText('Name')[1]!, 'b');
    await user.tab();
    await user.click(screen.getByRole('tab', { name: /Ausgaben/ }));
    const root = `${base}/outputs/value`;
    await setOp(root, 'fusion');
    await user.selectOptions(first(root, 'Strategie'), 'any_true');
    await user.selectOptions(within(node(`${root}/args/1`)).getByLabelText('Eingang'), 'b');
    expect(result()).toEqual(exampleDef('test.either'));
  });

  it('test.timed: named rules with Grace and stable_for, referenced by the output', async () => {
    const result = mount('test.timed');
    await user.click(screen.getByRole('tab', { name: /Benannte Regeln/ }));
    await user.click(screen.getByRole('button', { name: 'Regel' }));
    await type(screen.getAllByLabelText('Name')[0]!, 'grace');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Regel' }));
    await type(screen.getAllByLabelText('Name')[1]!, 'stable');
    await user.tab();

    const grace = `${base}/rules/grace`;
    await setOp(grace, 'temporal');
    await type(first(grace, 'ID (eindeutig)'), 'grace');
    await user.selectOptions(first(grace, 'Operation'), 'grace');
    await type(first(grace, 'Dauer (s)'), '10');

    const stable = `${base}/rules/stable`;
    await setOp(stable, 'temporal');
    await type(first(stable, 'ID (eindeutig)'), 'stable');
    await type(first(stable, 'Dauer (s)'), '2');
    await user.click(within(node(stable)).getByRole('checkbox', { name: /Gehaltene Werte/ }));
    await setOp(`${stable}/args/0`, 'ref');
    await user.selectOptions(within(node(`${stable}/args/0`)).getByLabelText('Interne Regel'), 'grace');

    await user.click(screen.getByRole('tab', { name: /Ausgaben/ }));
    const root = `${base}/outputs/value`;
    await setOp(root, 'ref');
    await user.selectOptions(within(node(root)).getByLabelText('Interne Regel'), 'stable');
    expect(result()).toEqual(exampleDef('test.timed'));
  });

  it('test.flow: typed multi-field output and a data-defined state machine with command, guard and deadline', async () => {
    const result = mount('test.flow');
    await user.click(screen.getByRole('tab', { name: /Ausgaben/ }));

    // value: enum with catalog, driven by the machine
    await user.selectOptions(first(`${base}/schema/fields/value`, 'Typ'), 'enum');
    const catalog = screen.getByLabelText(/Wertekatalog/);
    for (const entry of ['idle', 'active', 'done']) {
      await type(catalog, entry);
      await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    }
    await setOp(`${base}/outputs/value`, 'machine');

    const addField = async (name: string, fieldType: string, rule: () => Promise<void>) => {
      await user.click(screen.getByRole('button', { name: 'Ausgabefeld' }));
      await type(screen.getAllByLabelText('Feldname').at(-1)!, name);
      await user.tab();
      if (fieldType !== 'bool') await user.selectOptions(first(`${base}/schema/fields/${name}`, 'Typ'), fieldType);
      await rule();
    };
    const literal = async (name: string, fieldType: string, value: string) => {
      const path = `${base}/outputs/${name}`;
      await setOp(path, 'literal');
      await user.selectOptions(first(path, 'Typ'), fieldType);
      await type(first(path, 'Wert'), value);
    };
    await addField('truth', 'bool', async () => {}); // keeps its default rule `input a`
    await addField('count', 'number', () => literal('count', 'number', '2'));
    await addField('label', 'text', () => literal('label', 'text', 'synthetic'));
    await addField('stamp', 'timestamp', () => literal('stamp', 'timestamp', '2026-01-01T12:00:00+00:00'));
    await addField('metadata', 'object', async () => {
      const path = `${base}/outputs/metadata`;
      await setOp(path, 'literal');
      await user.selectOptions(first(path, 'Typ'), 'object');
      const json = first(path, 'Wert');
      await user.clear(json);
      await user.click(json);
      await user.paste('{"fixture": true}');
    });

    // State machine
    await user.click(screen.getByRole('tab', { name: /State Machine/ }));
    await user.click(screen.getByRole('button', { name: 'State Machine hinzufügen' }));
    const m = `${base}/machine`;
    await type(screen.getByLabelText('Maschinen-ID'), 'lifecycle');
    await user.click(screen.getByRole('button', { name: 'Zustand' }));
    await type(screen.getByLabelText('Zustand zustand'), 'done');
    await user.tab();
    await user.click(screen.getByRole('checkbox', { name: /Sessions/ }));
    await user.click(screen.getByRole('checkbox', { name: /Deadline verwenden/ }));
    await type(screen.getByLabelText(/Deadline \(s\)/), '10');
    await setOp(`${m}/reinitialize_when`, 'input');

    await user.click(screen.getByRole('button', { name: 'Befehl' }));
    await type(screen.getByLabelText('Befehlsname'), 'start');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Argument' }));
    await type(screen.getAllByLabelText('Argument').find((el) => (el as HTMLInputElement).value === 'arg')!, 'confirm');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'Transition' }));
    await user.selectOptions(screen.getAllByLabelText('Nach')[0]!, 'active');
    await user.selectOptions(screen.getAllByLabelText('Ereignis')[0]!, 'start');
    await type(screen.getAllByLabelText('Grund')[0]!, 'requested');
    await user.click(screen.getByRole('checkbox', { name: /confirm =/ }));
    await setOp(`${m}/transitions/0/guard`, 'input');

    await user.click(screen.getByRole('button', { name: 'Transition' }));
    await user.selectOptions(screen.getAllByLabelText('Von')[1]!, 'active');
    await user.selectOptions(screen.getAllByLabelText('Nach')[1]!, 'done');
    await user.selectOptions(screen.getAllByLabelText('Ereignis')[1]!, 'deadline');
    await type(screen.getAllByLabelText('Grund')[1]!, 'elapsed');
    await user.click(screen.getAllByRole('checkbox', { name: /Beendet Episode/ })[1]!);

    expect(result()).toEqual(exampleDef('test.flow'));
  });
});
