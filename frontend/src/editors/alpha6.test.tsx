import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BindingEditor, sourceCast } from './RegistryObjects';
import { MachineEditor } from './MachineEditor';
import type { JsonObject } from '@/lib/json';

describe('explicit source conversions', () => {
  it('writes the source type into a new binding', () => {
    expect(sourceCast({ source_type: 'boolean' })).toEqual({ kind: 'type_cast', target: 'bool' });
    expect(sourceCast({ source_type: 'numeric' })).toEqual({ kind: 'type_cast', target: 'number' });
    expect(sourceCast({ source_type: 'state', value_schema: { type: 'enum' } })).toBeUndefined();
  });
  it('repairs an old binding and keeps the conversion in the document', async () => {
    function Harness() {
      const [value, setValue] = useState<JsonObject>({ binding_id: 'binding.a', source_id: 'source.a', adapter: { kind: 'ha_state', ha_entity_id: 'binary_sensor.test' } });
      return <><BindingEditor value={value} onChange={setValue} pointer="/bindings/0" sourceIds={['source.a']} sources={[{ source_id: 'source.a', source_type: 'boolean' }]} catalogIds={[]} onPickEntity={() => {}} /><output data-testid="document">{JSON.stringify(value)}</output></>;
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Umwandlung ergänzen' }));
    expect(JSON.parse(screen.getByTestId('document').textContent!).transform).toEqual({ kind: 'type_cast', target: 'bool' });
  });
});

it('shows a missing restart condition and explicitly writes it on request', async () => {
  function Harness() {
    const [machine, setMachine] = useState<JsonObject>({ id: 'm', states: ['idle'], initial: 'idle', transitions: [], commands: {} });
    return <><MachineEditor value={machine} onChange={setMachine} pointer="/definitions/0/machine" definition={{ inputs: [] }} caps={undefined} locked={false} /><output data-testid="machine">{JSON.stringify(machine)}</output></>;
  }
  render(<Harness />);
  expect(screen.getByText('Neustart-Bedingung fehlt')).toBeInTheDocument();
  expect(JSON.parse(screen.getByTestId('machine').textContent!).reinitialize_when).toBeUndefined();
  await userEvent.click(screen.getByRole('button', { name: 'Bedingung festlegen' }));
  expect(JSON.parse(screen.getByTestId('machine').textContent!).reinitialize_when.value).toBe(false);
  expect(screen.getByText('Dieser Ablauf kann sich nach einer Änderung nie selbst erholen')).toBeInTheDocument();
});
