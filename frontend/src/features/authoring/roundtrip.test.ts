import { describe, expect, it } from 'vitest';
import example from '../../../../docs/alpha4/example-registry.json';
import { canonicalJson, clone, deepEqual, getAt, setAt, type JsonObject } from '@/lib/json';
import { changedPaths, locateIssue } from './locate';
import { exportRegistry, parseRegistryJson } from './importExport';
import { collectStatefulIds, newDefinition, nextVersionOf, referencedNames, renameReferences, ruleContext } from './model';
import { refOptions, typeCatalog } from './catalog';
import { caps } from '../../../test/harness';

const registry = () => clone(example) as unknown as JsonObject;

describe('import / export round trip', () => {
  it('a valid imported registry survives import → edit → export without losing supported data', () => {
    const imported = parseRegistryJson(JSON.stringify(registry()));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(deepEqual(imported.config, registry())).toBe(true);
    // Edit one field the way an editor does; every other member stays byte-identical.
    const edited = setAt(imported.config, '/definitions/4/machine/deadline_s', 30);
    expect(getAt(edited, '/definitions/4/machine/deadline_s')).toBe(30);
    const restored = setAt(edited, '/definitions/4/machine/deadline_s', 10);
    expect(deepEqual(restored, registry())).toBe(true);
    // Export is canonical and re-importable.
    const again = parseRegistryJson(exportRegistry(restored));
    expect(again.ok && deepEqual(again.config, registry())).toBe(true);
  });

  it('unknown but harmless members are preserved by document edits', () => {
    const doc = registry();
    (doc.definitions as JsonObject[])[0]!.x_future = { keep: ['me'] };
    ((doc.definitions as JsonObject[])[0]!.outputs as JsonObject).value = { op: 'input', name: 'a', x_note: 1 };
    const edited = setAt(doc, '/definitions/0/display_name', 'Neu');
    expect(getAt(edited, '/definitions/0/x_future')).toEqual({ keep: ['me'] });
    expect(getAt(edited, '/definitions/0/outputs/value/x_note')).toBe(1);
  });

  it('accepts the wrapped draft form and rejects null, arrays and scalars like the server', () => {
    const wrapped = parseRegistryJson(JSON.stringify({ display_name: 'X', config: registry() }));
    expect(wrapped).toMatchObject({ ok: true, display_name: 'X' });
    for (const bad of ['null', '[]', '7', '"x"', '{nope']) expect(parseRegistryJson(bad).ok).toBe(false);
  });

  it('export is order-independent and stable', () => {
    const shuffled = Object.fromEntries(Object.entries(registry()).reverse());
    expect(exportRegistry(shuffled)).toBe(exportRegistry(registry()));
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}');
  });
});

describe('pure authoring helpers', () => {
  it('locates validation findings at the editor that owns the object', () => {
    const doc = registry();
    expect(locateIssue('/definitions/4/machine/transitions/0/event', doc)).toEqual({ to: '/definitions/test.flow/1?tab=machine', label: 'Definition test.flow@1' });
    expect(locateIssue('/definitions/1/outputs/value', doc).to).toBe('/definitions/test.either/1?tab=outputs');
    expect(locateIssue('/contracts/2/inputs/0/ref', doc).to).toBe('/contracts/fixture.either');
    expect(locateIssue('/sources/1/freshness', doc).to).toBe('/sources?tab=sources&item=1');
    expect(locateIssue('/bindings/0/adapter', doc).to).toBe('/sources?tab=bindings&item=0');
    expect(locateIssue('/fingerprint_version', doc).to).toBe('/registry');
  });

  it('structural path diff is symmetric about what changed', () => {
    const a = registry();
    const b = setAt(registry(), '/contracts/0/enabled', false);
    expect(changedPaths(a, b)).toEqual(['/contracts/0/enabled']);
    expect(changedPaths(a, a)).toEqual([]);
  });

  it('creates the next definition version as a copy and never reuses a number', () => {
    const defs = (registry().definitions as JsonObject[]);
    const v2 = nextVersionOf(defs[0]!, defs);
    expect(v2.type_version).toBe(2);
    expect(nextVersionOf(v2, [...defs, v2]).type_version).toBe(3);
    expect(defs[0]!.type_version).toBe(1);
  });

  it('renames references consistently and counts usage', () => {
    const timed = (registry().definitions as JsonObject[]).find((d) => d.type_id === 'test.timed')!;
    expect(referencedNames(timed, 'ref').get('grace')).toBe(1);
    const renamed = renameReferences(timed, 'ref', 'grace', 'halten');
    expect(referencedNames(renamed, 'ref').has('grace')).toBe(false);
    expect(referencedNames(renamed, 'ref').get('halten')).toBe(1);
    expect([...collectStatefulIds(timed)].sort()).toEqual(['grace', 'stable']);
  });

  it('offers typed references: sources, contracts and contract.field outputs', () => {
    const types = typeCatalog(caps, registry());
    const options = refOptions(registry(), types, 'fixture.timed').map((o) => o.value);
    expect(options).toContain('source.a');
    expect(options).toContain('fixture.flow.metadata');
    expect(options).not.toContain('fixture.timed');
    const flow = types.find((t) => t.key === 'test.flow@1')!;
    expect(flow).toMatchObject({ origin: 'draft-definition', declarative: true, machine: true });
    expect(Object.keys(flow.fields)).toEqual(['value', 'truth', 'count', 'label', 'stamp', 'metadata']);
  });

  it('rule context for guards is stateless', () => {
    const ctx = ruleContext(newDefinition('test.x', 1), true);
    expect(ctx.stateless).toBe(true);
    expect(ctx.inputs.map((i) => i.name)).toEqual(['a']);
  });
});
