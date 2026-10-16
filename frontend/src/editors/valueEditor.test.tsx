import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newFieldSchema, type FieldSchema } from '@/features/authoring/model';
import type { Json, JsonObject } from '@/lib/json';
import { Stateful, wrap } from '../../test/harness';
import { FieldSchemaEditor } from './FieldSchemaEditor';
import { TypedValueEditor } from './common';
import { ValueEditor } from './ValueEditor';

/** T1B-04/05: structured values are edited graphically and keep type and content. */
const user = userEvent.setup();

function mount(initial: Json, render?: (value: Json, set: (n: Json) => void) => React.ReactNode) {
  let current: Json = initial;
  wrap(
    <Stateful initial={{ v: initial }} onValue={(o) => (current = o.v as Json)}>
      {(o, set) => (render ? render(o.v as Json, (n) => set({ v: n })) : <ValueEditor label="Wert" pointer="/v" value={o.v as Json} onChange={(n) => set({ v: n })} />)}
    </Stateful>,
  );
  return () => current;
}
const type = async (el: HTMLElement, text: string) => {
  await user.clear(el);
  await user.type(el, text);
};

describe('ValueEditor', () => {
  it('builds a nested, mixed structure with controls only', async () => {
    const result = mount({});
    await user.click(screen.getByRole('button', { name: 'Wert: Eigenschaft hinzufügen' }));
    await type(screen.getByLabelText('Wert: Schlüssel 1'), 'name');
    await user.tab();
    await type(screen.getByLabelText('Wert.name'), 'Terra');
    await user.click(screen.getByRole('button', { name: 'Wert: Eigenschaft hinzufügen' }));
    await type(screen.getByLabelText('Wert: Schlüssel 2'), 'liste');
    await user.tab();
    await user.selectOptions(screen.getByLabelText('Wert.liste: Typ'), 'array');
    await user.click(screen.getByRole('button', { name: 'Wert.liste: Element hinzufügen' }));
    await user.selectOptions(screen.getByLabelText('Wert.liste[1]: Typ'), 'number');
    await type(screen.getByLabelText('Wert.liste[1]'), '42');
    await user.click(screen.getByRole('button', { name: 'Wert.liste: Element hinzufügen' }));
    await user.selectOptions(screen.getByLabelText('Wert.liste[2]: Typ'), 'object');
    await user.click(screen.getByRole('button', { name: 'Wert.liste[2]: Eigenschaft hinzufügen' }));
    await user.selectOptions(screen.getByLabelText('Wert.liste[2].schluessel1: Typ'), 'boolean');
    await user.click(screen.getByRole('button', { name: 'Wert.liste: Element hinzufügen' }));
    await user.selectOptions(screen.getByLabelText('Wert.liste[3]: Typ'), 'null');
    expect(result()).toEqual({ name: 'Terra', liste: [42, { schluessel1: false }, null] });
  });

  it('opens an existing structure with its real types and edits one leaf without touching the rest', async () => {
    const original = { a: [1, { b: null, c: 'x' }], d: true, e: 'text' };
    const result = mount(original);
    expect(screen.getByLabelText('Wert.a: Typ')).toHaveValue('array');
    expect(screen.getByLabelText('Wert.a[2].b: Typ')).toHaveValue('null');
    expect(screen.getByLabelText('Wert.d: Typ')).toHaveValue('boolean');
    expect(document.body.textContent).not.toContain('[object Object]');
    await user.selectOptions(screen.getByLabelText('Wert.d'), 'false');
    expect(result()).toEqual({ ...original, d: false });
  });

  it('renames keys in place (order kept), rejects duplicates and reorders list elements', async () => {
    const result = mount({ x: 1, y: 2 });
    await type(screen.getByLabelText('Wert: Schlüssel 1'), 'z');
    await user.tab();
    expect(Object.keys(result() as JsonObject)).toEqual(['z', 'y']);
    await type(screen.getByLabelText('Wert: Schlüssel 2'), 'z');
    await user.tab();
    expect(screen.getByText(/existiert bereits/)).toBeInTheDocument();
    expect(Object.keys(result() as JsonObject)).toEqual(['z', 'y']);
  });

  it('reorders and removes list elements', async () => {
    const result = mount(['a', 'b', 'c']);
    await user.click(screen.getByRole('button', { name: 'Element 3 nach oben' }));
    expect(result()).toEqual(['a', 'c', 'b']);
    await user.click(screen.getByRole('button', { name: 'Element 1 entfernen' }));
    expect(result()).toEqual(['c', 'b']);
  });

  it('keeps types when switching: text ↔ number, empty text is no list element', async () => {
    const result = mount('12');
    await user.selectOptions(screen.getByLabelText('Wert: Typ'), 'number');
    expect(result()).toBe(12);
    await user.selectOptions(screen.getByLabelText('Wert: Typ'), 'string');
    expect(result()).toBe('12');
    await user.clear(screen.getByLabelText('Wert'));
    await user.selectOptions(screen.getByLabelText('Wert: Typ'), 'array');
    expect(result()).toEqual([]);
  });

  it('the JSON view is optional, shows the same value and never takes over on invalid text', async () => {
    const result = mount({ a: 1 });
    await user.click(screen.getByText("JSON-Ansicht (freiwillig, Experte)"));
    const json = screen.getByLabelText('Wert: JSON');
    expect(JSON.parse((json as HTMLTextAreaElement).value)).toEqual({ a: 1 });
    await user.click(json);
    await user.paste('{kaputt');
    expect(screen.getByText(/Ungültiges JSON/)).toBeInTheDocument();
    expect(result()).toEqual({ a: 1 });
  });

  it('object-typed fields accept every kind except null; other types keep their own widgets', async () => {
    const objectSchema = newFieldSchema('object');
    const result = mount({ fixture: true }, (v, set) => <TypedValueEditor schema={objectSchema} value={v} pointer="/v" onChange={set} />);
    const kinds = [...screen.getByLabelText('Wert: Typ').querySelectorAll('option')].map((o) => o.value);
    expect(kinds).toEqual(['string', 'number', 'boolean', 'object', 'array']);
    await user.selectOptions(screen.getByLabelText('Wert: Typ'), 'array');
    expect(result()).toEqual([{ fixture: true }]);
  });
});

describe('UX-01: restricted text values can be created directly', () => {
  it('offers a catalog for a plain text field without the enum detour and keeps the type', async () => {
    let current: FieldSchema = newFieldSchema('text');
    wrap(<Stateful initial={current} onValue={(v) => (current = v as FieldSchema)}>{(v, set) => <FieldSchemaEditor pointer="/s" value={v as FieldSchema} onChange={(n) => set(n as unknown as JsonObject)} />}</Stateful>);
    expect(screen.queryByLabelText(/^Wertekatalog/)).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /auf feste Textwerte einschränken/i }));
    for (const value of ['hell', 'dunkel']) {
      await type(screen.getByLabelText(/^Wertekatalog/), value);
      await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    }
    expect(current).toMatchObject({ type: 'text', value_catalog: ['hell', 'dunkel'] });
    // removing the last value drops the (empty) property again; the type stays text
    await user.click(screen.getByRole('button', { name: 'hell entfernen' }));
    await user.click(screen.getByRole('button', { name: 'dunkel entfernen' }));
    expect(current.type).toBe('text');
    expect('value_catalog' in current).toBe(false);
  });

  it('an enum still requires its catalog, a number never shows one', () => {
    wrap(<FieldSchemaEditor pointer="/s" value={newFieldSchema('number')} onChange={() => {}} />);
    expect(screen.queryByLabelText(/^Wertekatalog/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /einschränken/ })).toBeNull();
  });
});
