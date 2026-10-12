import dagre from '@dagrejs/dagre';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Cable, FileCode2, Sigma } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FieldStatusBadge, QualityBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/form';
import { Empty, KeyValue, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useLive } from '@/lib/live-context';
import { cn } from '@/lib/utils';
import type { Envelope } from '@/lib/types';
import { buildGraph, neighborhood, nodeId, reach, type Graph, type GraphNode } from './buildGraph';

interface NodeData extends Record<string, unknown> {
  node: GraphNode;
  envelope: Envelope | null;
  dim: boolean;
}

const WIDTH = 220;
const HEIGHT = 64;

function layout(graph: Graph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  graph.nodes.forEach((n) => g.setNode(n.id, { width: WIDTH, height: HEIGHT }));
  graph.edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return new Map(graph.nodes.map((n) => {
    const pos = g.node(n.id);
    return [n.id, { x: (pos?.x ?? 0) - WIDTH / 2, y: (pos?.y ?? 0) - HEIGHT / 2 }];
  }));
}

/** Contract nodes show server-provided health; sources and results are structural. */
const TerraNode = memo(function TerraNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const { node, envelope, dim } = data;
  const tone =
    node.kind === 'contract'
      ? node.enabled === false
        ? 'border-line-strong'
        : envelope
          ? envelope.contract_health === 'healthy'
            ? 'border-ok/60'
            : 'border-warn/70'
          : 'border-line-strong'
      : node.kind === 'source'
        ? 'border-info/50'
        : 'border-accent/40 border-dashed';
  const Icon = node.kind === 'source' ? Cable : node.kind === 'contract' ? FileCode2 : Sigma;
  return (
    <div
      className={cn('rounded-[var(--radius-md)] border bg-panel px-3 py-2 shadow-sm', tone, selected && 'ring-2 ring-accent', dim && 'opacity-35')}
      style={{ width: WIDTH, height: HEIGHT }}
      data-testid={`node-${node.id}`}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-line-strong !bg-raised" />
      <div className="flex items-center gap-2">
        <Icon size={14} className={node.kind === 'source' ? 'text-info' : node.kind === 'contract' ? 'text-accent' : 'text-muted'} />
        <span className="truncate font-mono text-xs font-medium">{node.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="truncate">{node.detail}</span>
        {node.kind === 'contract' && node.enabled === false && <Badge>aus</Badge>}
        {node.kind === 'contract' && envelope && <span className={envelope.contract_health === 'healthy' ? 'text-ok' : 'text-warn'}>●</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-line-strong !bg-raised" />
    </div>
  );
});
const nodeTypes = { terra: TerraNode };

function Canvas({ graph, envelopes, selected, onSelect, focus }: { graph: Graph; envelopes: Record<string, Envelope> | null; selected: string | null; onSelect: (id: string | null) => void; focus: string | null }) {
  const flow = useReactFlow();
  const positions = useMemo(() => layout(graph), [graph]);
  const highlighted = useMemo(() => {
    if (!selected) return null;
    const r = reach(graph, selected);
    return new Set([selected, ...r.upstream, ...r.downstream]);
  }, [graph, selected]);

  const nodes: Node<NodeData>[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'terra',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    selected: node.id === selected,
    data: { node, envelope: node.contractId && node.kind === 'contract' ? (envelopes?.[node.contractId] ?? null) : null, dim: highlighted !== null && !highlighted.has(node.id) },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: false,
    style: edge.kind === 'input' ? undefined : { strokeDasharray: '5 4' },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    labelStyle: { fontSize: 10, fill: 'var(--color-muted)' },
    labelBgStyle: { fill: 'var(--color-panel)' },
  }));

  useEffect(() => {
    if (focus) void flow.fitView({ nodes: [{ id: focus }], duration: 300, maxZoom: 1.2 });
  }, [focus, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: true }}
      aria-label="Abhängigkeitsgraph"
    >
      <Background gap={24} color="var(--color-line)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={() => 'var(--color-line-strong)'} maskColor="rgb(0 0 0 / 0.5)" />
    </ReactFlow>
  );
}

function Details({ node, graph, envelope }: { node: GraphNode; graph: Graph; envelope: Envelope | null }) {
  const navigate = useNavigate();
  const { upstream, downstream } = reach(graph, node.id);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <Panel>
      <PanelHeader title={<span className="font-mono">{node.label}</span>} aside={<Badge tone={node.kind === 'source' ? 'info' : node.kind === 'contract' ? 'accent' : 'neutral'}>{node.kind === 'source' ? 'Quelle' : node.kind === 'contract' ? (node.declarative ? 'Contract (deklarativ)' : 'Contract (Paket-Typ)') : 'Abgeleitetes Ergebnis'}</Badge>} />
      <div className="flex flex-col gap-4 p-4 text-sm">
        <KeyValue items={[{ label: 'Details', value: node.detail }, ...(node.kind === 'contract' ? [{ label: 'Status', value: node.enabled === false ? 'deaktiviert' : 'aktiviert' }] : [])]} />
        {node.kind === 'contract' && envelope && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2"><QualityBadge quality={envelope.contract_health} /><Badge tone={envelope.available ? 'ok' : 'warn'}>{envelope.available ? 'verfügbar' : 'nicht verfügbar'}</Badge></div>
            <ul className="space-y-1 text-xs">
              {Object.entries(envelope.fields).map(([name, field]) => (
                <li key={name} className="flex items-center gap-2"><code>{name}</code><FieldStatusBadge field={field} /></li>
              ))}
            </ul>
          </div>
        )}
        {node.kind === 'contract' && !envelope && <p className="text-xs text-muted">Kein Live-Zustand (deaktiviert, nur im Draft oder noch nicht aktiviert).</p>}
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Hängt ab von ({upstream.length})</p>
          <p className="flex flex-wrap gap-1.5">{upstream.length ? upstream.map((id) => <Badge key={id}>{label(id)}</Badge>) : <span className="text-xs text-faint">–</span>}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Wird verwendet von ({downstream.length})</p>
          <p className="flex flex-wrap gap-1.5">{downstream.length ? downstream.map((id) => <Badge key={id}>{label(id)}</Badge>) : <span className="text-xs text-faint">–</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {node.kind === 'contract' && <Button size="sm" variant="primary" onClick={() => navigate(`/contracts/${encodeURIComponent(node.label)}`)}>Detailansicht</Button>}
          {node.kind === 'contract' && <Link to={`/diagnostics?contract=${encodeURIComponent(node.label)}`}><Button size="sm">Diagnose</Button></Link>}
          {node.kind === 'result' && node.contractId && <Button size="sm" variant="primary" onClick={() => navigate(`/contracts/${encodeURIComponent(node.contractId!)}`)}>Contract öffnen</Button>}
          {node.kind === 'source' && <Button size="sm" variant="primary" onClick={() => navigate(`/sources?tab=sources&item=${node.index ?? 0}`)}>Quelle öffnen</Button>}
        </div>
      </div>
    </Panel>
  );
}

export default function GraphPage() {
  const src = useAuthoringSource();
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const [structural, setStructural] = useState(false);
  const [depth, setDepth] = useState<'all' | '1' | '2' | '3'>('all');
  const [search, setSearch] = useState('');
  const selected = params.get('node');

  const full = useMemo(() => buildGraph(src.config, { structural }), [src.config, structural]);
  const graph = useMemo(() => (selected && depth !== 'all' && full.nodes.some((n) => n.id === selected) ? neighborhood(full, selected, Number(depth)) : full), [full, selected, depth]);
  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? null;
  const match = search.trim() ? graph.nodes.find((n) => n.label.toLowerCase().includes(search.trim().toLowerCase())) ?? null : null;
  const select = (id: string | null) => setParams(id ? { node: id } : {}, { replace: true });

  return (
    <>
      <PageHeader title="Graph" description="Quellen, Contracts und abgeleitete Ergebnisse. Kanten zeigen, welcher Eingang woraus gespeist wird; Farbe und Rand folgen dem Zustand, den der Server meldet." />
      <ReadOnlyNotice what="Graph" />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input aria-label="Knoten suchen" className="w-56" placeholder="Knoten suchen …" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && match && select(match.id)} />
        <Button size="sm" disabled={!match} onClick={() => match && select(match.id)}>Auswählen</Button>
        <Select aria-label="Nachbarschaft" className="w-52" value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)} disabled={!selected}>
          <option value="all">Gesamter Graph</option>
          <option value="1">Nachbarschaft: 1 Schritt</option>
          <option value="2">Nachbarschaft: 2 Schritte</option>
          <option value="3">Nachbarschaft: 3 Schritte</option>
        </Select>
        <Switch checked={structural} onCheckedChange={setStructural} label="Liveness & Dependencies" />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-info/60" /> Quelle</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-ok/70" /> Contract gesund</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-warn/70" /> eingeschränkt</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-dashed border-accent/60" /> Ergebnis</span>
        </span>
      </div>
      {live.stale && live.contracts && <p className="mb-2 text-xs text-warn">Zustandsfarben: letzter bekannter Stand, Live-Verbindung nicht aktuell.</p>}
      {src.loading ? (
        <Spinner />
      ) : full.nodes.length === 0 ? (
        <Panel><Empty title="Noch nichts darzustellen">Der Graph entsteht aus Sources und Contracts der aktiven Registry oder des geöffneten Drafts.</Empty></Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel className="h-[min(70vh,44rem)] min-h-[24rem] overflow-hidden">
            <ReactFlowProvider>
              <Canvas key={`${structural}-${depth}-${selected ?? ''}`} graph={graph} envelopes={live.contracts} selected={selected} onSelect={select} focus={selected ?? match?.id ?? null} />
            </ReactFlowProvider>
          </Panel>
          {selectedNode ? <Details node={selectedNode} graph={full} envelope={selectedNode.contractId ? (live.contracts?.[selectedNode.contractId] ?? null) : null} /> : <Panel><Empty title="Knoten wählen">Klicken Sie einen Knoten an, um Zustand, Abhängigkeiten und Sprungziele zu sehen.</Empty></Panel>}
        </div>
      )}
    </>
  );
}

export { nodeId };
