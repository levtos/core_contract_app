import { describe, expect, it } from 'vitest';
import example from '../../../../docs/alpha4/example-registry.json';
import { clone, type JsonObject } from '@/lib/json';
import { buildGraph, neighborhood, nodeId, reach } from './buildGraph';

const registry = () => clone(example) as unknown as JsonObject;

describe('dependency graph', () => {
  it('distinguishes sources, contracts and derived results', () => {
    const graph = buildGraph(registry());
    expect(graph.nodes.filter((n) => n.kind === 'source').map((n) => n.label).sort()).toEqual(['source.a', 'source.b']);
    expect(graph.nodes.filter((n) => n.kind === 'contract')).toHaveLength(6);
    expect(graph.nodes.filter((n) => n.kind === 'contract').every((n) => n.declarative)).toBe(true);
    expect(graph.edges.some((e) => e.source === nodeId('source', 'source.a') && e.target === nodeId('contract', 'fixture.left'))).toBe(true);
    expect(graph.edges.some((e) => e.source === nodeId('contract', 'fixture.left') && e.target === nodeId('contract', 'fixture.either'))).toBe(true);
  });

  it('inserts a derived-result node for contract.field references', () => {
    const doc = registry();
    (doc.contracts as JsonObject[])[3]!.inputs = [{ name: 'a', ref: 'fixture.either.value' }];
    const graph = buildGraph(doc);
    const result = graph.nodes.find((n) => n.kind === 'result');
    expect(result).toMatchObject({ label: 'value', detail: 'Ergebnis von fixture.either' });
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toContain(`${nodeId('contract', 'fixture.either')}>${result!.id}`);
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toContain(`${result!.id}>${nodeId('contract', 'fixture.condition')}`);
  });

  it('computes transitive upstream and downstream reach and a bounded neighbourhood', () => {
    const graph = buildGraph(registry());
    const either = nodeId('contract', 'fixture.either');
    const { upstream, downstream } = reach(graph, either);
    expect(upstream.sort()).toEqual([nodeId('contract', 'fixture.left'), nodeId('contract', 'fixture.right'), nodeId('source', 'source.a'), nodeId('source', 'source.b')].sort());
    expect(downstream.sort()).toEqual([nodeId('contract', 'fixture.condition'), nodeId('contract', 'fixture.timed'), nodeId('contract', 'fixture.flow')].sort());
    const near = neighborhood(graph, either, 1);
    expect(near.nodes.map((n) => n.label).sort()).toEqual(['fixture.condition', 'fixture.either', 'fixture.left', 'fixture.right']);
  });

  it('ignores references that resolve to nothing instead of inventing nodes', () => {
    const doc = registry();
    (doc.contracts as JsonObject[])[0]!.inputs = [{ name: 'a', ref: 'does.not.exist' }];
    const graph = buildGraph(doc);
    expect(graph.edges.some((e) => e.target === nodeId('contract', 'fixture.left'))).toBe(false);
  });

  it('draws liveness and dependency monitors only on request', () => {
    const doc = registry();
    (doc.sources as JsonObject[])[1]!.freshness = { mode: 'liveness_source', future_tolerance_s: 1, interval_s: 5, liveness_source: 'source.a' };
    expect(buildGraph(doc).edges.some((e) => e.kind === 'liveness')).toBe(false);
    expect(buildGraph(doc, { structural: true }).edges.some((e) => e.kind === 'liveness' && e.target === nodeId('source', 'source.b'))).toBe(true);
  });
});
