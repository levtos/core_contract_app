import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import example from '../../test/fixtures/example-registry.json';
import { newDefinition } from '@/features/authoring/model';
import type { JsonObject } from '@/lib/json';
import { gui } from '../../test/gui';
import { caps, Stateful, wrap } from '../../test/harness';
import { DefinitionEditor } from './DefinitionEditor';

/**
 * Acceptance criteria 1-3: the Alpha-4 example definitions are rebuilt purely by
 * operating the graphical editors — including the object value, the nested rules and
 * the state machine — and the result equals the example. No JSON is typed or pasted.
 */
const user = userEvent.setup();
const steps = gui(user);
const defs = (example as unknown as { definitions: JsonObject[] }).definitions;
const exampleDef = (id: string) => defs.find((d) => d.type_id === id)!;
const base = '/definitions/0';

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
  it('test.truth is the untouched starting point of a new definition', () => {
    expect(mount('test.truth')()).toEqual(exampleDef('test.truth'));
  });

  it('test.condition: nested AND / NOT / literal / compare / formula', async () => {
    const result = mount('test.condition');
    await steps.buildCondition(base);
    expect(result()).toEqual(exampleDef('test.condition'));
  });

  it('test.either: second input, fusion with explicit strategy', async () => {
    const result = mount('test.either');
    await steps.buildEither(base);
    expect(result()).toEqual(exampleDef('test.either'));
  });

  it('test.timed: named rules with Grace and stable_for, referenced by the output', async () => {
    const result = mount('test.timed');
    await steps.buildTimed(base);
    expect(result()).toEqual(exampleDef('test.timed'));
  });

  it('test.flow: typed multi-field output (object value) and a data-defined state machine', async () => {
    const result = mount('test.flow');
    await steps.buildFlow(base);
    expect(result()).toEqual(exampleDef('test.flow'));
  });
});
