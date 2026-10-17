import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { ContractEditor } from '@/editors/RegistryObjects';
import { typeCatalog } from '@/features/authoring/catalog';
import { asObject } from '@/features/authoring/model';
import { caps, Stateful, wrap } from '../../test/harness';

it('edits typed instance parameters without changing the immutable template', async () => {
  const definition = { type_id: 'example.distance', type_version: 1, inputs: [], schema: { fields: {} }, parameter_schema: {
    near: { schema: { type: 'number', required: true, unit: 'm' }, minimum: 0, label: 'Naher Abstand' },
  } };
  const types = typeCatalog(caps, { definitions: [definition] });
  let result = {};
  const initial = { contract_id: 'example', type_id: definition.type_id, type_version: 1, inputs: [], enabled: true, parameters: { near: 10 } };
  wrap(<Stateful initial={initial} onValue={value => { result = value; }}>{(value, set) => <ContractEditor value={value} onChange={set} pointer="/contracts/0" types={types} refs={[]} />}</Stateful>);
  expect(screen.getByText('Deine Änderung gilt erst, wenn du den Entwurf übernimmst.')).toBeVisible();
  const input = screen.getByLabelText('Naher Abstand (m) *');
  await userEvent.clear(input);
  await userEvent.type(input, '25');
  expect(asObject(asObject(result).parameters).near).toBe(25);
  expect(definition.type_version).toBe(1);
  expect(definition.parameter_schema.near).not.toHaveProperty('value');
});
