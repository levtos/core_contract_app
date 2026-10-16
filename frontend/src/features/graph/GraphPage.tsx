import { t as uiText } from '@/i18n';
import dagre from '@dagrejs/dagre';
import { applyNodeChanges, Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import { Cable, FileCode2, Sigma } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FieldStatusBadge, QualityBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
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
        {node.kind === 'contract' && node.enabled === false && <Badge>{uiText("features.graph.GraphPage.aus_2337c3")}</Badge>}
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

  const desired: Node<NodeData>[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: 'terra',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        // Fixed card size: nodes are usable (and fitView works) before any DOM measurement.
        width: WIDTH,
        height: HEIGHT,
        selected: node.id === selected,
        data: { node, envelope: node.contractId && node.kind === 'contract' ? (envelopes?.[node.contractId] ?? null) : null, dim: highlighted !== null && !highlighted.has(node.id) },
      })),
    [graph, positions, selected, envelopes, highlighted],
  );
  // React Flow reports node sizes as changes; a controlled canvas must apply them or nothing renders.
  const [nodes, setNodes] = useState<Node<NodeData>[]>(desired);
  useEffect(() => {
    setNodes((previous) => desired.map((node) => ({ ...node, measured: previous.find((p) => p.id === node.id)?.measured })));
  }, [desired]);
  const onNodesChange = useCallback((changes: NodeChange<Node<NodeData>>[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
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
      onNodesChange={onNodesChange}
      fitView
      fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: true }}
      aria-label={uiText("features.graph.GraphPage.abhangigkeitsgraph_52b36e")}
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
      <PanelHeader title={<span className="font-mono">{node.label}</span>} aside={<Badge tone={node.kind === 'source' ? 'info' : node.kind === 'contract' ? 'accent' : 'neutral'}>{node.kind === 'source' ? uiText("features.graph.GraphPage.quelle_037889") : node.kind === 'contract' ? (node.declarative ? uiText("features.graph.GraphPage.contract_deklarativ_4bb04f") : uiText("features.graph.GraphPage.contract_paket_typ_ad3d17")) : uiText("features.graph.GraphPage.abgeleitetes_ergebnis_1c7c27")}</Badge>} />
      <div className="flex flex-col gap-4 p-4 text-sm">
        <KeyValue items={[{ label: uiText("features.graph.GraphPage.details_45989d"), value: node.detail }, ...(node.kind === 'contract' ? [{ label: uiText("features.graph.GraphPage.status_920e41"), value: node.enabled === false ? uiText("features.graph.GraphPage.deaktiviert_10f33e") : uiText("features.graph.GraphPage.aktiviert_acb27b") }] : [])]} />
        {node.kind === 'contract' && envelope && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2"><QualityBadge quality={envelope.contract_health} /><Badge tone={envelope.available ? 'ok' : 'warn'}>{envelope.available ? uiText("features.graph.GraphPage.verfugbar_e5a644") : uiText("features.graph.GraphPage.nicht_verfugbar_9a98b3")}</Badge></div>
            <ul className="space-y-1 text-xs">
              {Object.entries(envelope.fields).map(([name, field]) => (
                <li key={name} className="flex items-center gap-2"><code>{name}</code><FieldStatusBadge field={field} /></li>
              ))}
            </ul>
          </div>
        )}
        {node.kind === 'contract' && !envelope && <p className="text-xs text-muted">{uiText("features.graph.GraphPage.kein_live_zustand_deaktiviert_nur_im_draft_oder__f8cc5d")}</p>}
        <div>
          <p className="mb-1 text-xs font-medium text-muted">{uiText("features.graph.GraphPage.hangt_ab_von_e6eb2f")}{upstream.length})</p>
          <p className="flex flex-wrap gap-1.5">{upstream.length ? upstream.map((id) => <Badge key={id}>{label(id)}</Badge>) : <span className="text-xs text-faint">–</span>}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">{uiText("features.graph.GraphPage.wird_verwendet_von_f076e4")}{downstream.length})</p>
          <p className="flex flex-wrap gap-1.5">{downstream.length ? downstream.map((id) => <Badge key={id}>{label(id)}</Badge>) : <span className="text-xs text-faint">–</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {node.kind === 'contract' && <Button size="sm" variant="primary" onClick={() => navigate(`/contracts/view/${encodeURIComponent(node.label)}`)}>{uiText("features.graph.GraphPage.detailansicht_9d72e5")}</Button>}
          {node.kind === 'contract' && <Link to={`/diagnostics?contract=${encodeURIComponent(node.label)}`}><Button size="sm">{uiText("features.graph.GraphPage.diagnose_64dd65")}</Button></Link>}
          {node.kind === 'result' && node.contractId && <Button size="sm" variant="primary" onClick={() => navigate(`/contracts/view/${encodeURIComponent(node.contractId!)}`)}>{uiText("features.graph.GraphPage.contract_offnen_019eff")}</Button>}
          {node.kind === 'source' && <Button size="sm" variant="primary" onClick={() => navigate(`/sources?tab=sources&item=${node.index ?? 0}`)}>{uiText("features.graph.GraphPage.quelle_offnen_16c604")}</Button>}
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
      <PageHeader title={uiText("features.graph.GraphPage.graph_32ab01")} description={uiText("features.graph.GraphPage.quellen_contracts_und_abgeleitete_ergebnisse_kan_5cf87d")} />
      <ReadOnlyNotice what={uiText("features.graph.GraphPage.graph_32ab01")} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input aria-label={uiText("features.graph.GraphPage.knoten_suchen_5bcf84")} className="w-56" placeholder={uiText("features.graph.GraphPage.knoten_suchen_64e35f")} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && match && select(match.id)} />
        <Button size="sm" disabled={!match} onClick={() => match && select(match.id)}>{uiText("features.graph.GraphPage.auswahlen_0bf1ed")}</Button>
        <Select aria-label={uiText("features.graph.GraphPage.nachbarschaft_d49e47")} className="w-52" value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)} disabled={!selected}>
          <option value="all">{uiText("features.graph.GraphPage.gesamter_graph_ce5753")}</option>
          <option value="1">{uiText("features.graph.GraphPage.nachbarschaft_1_schritt_6ed35c")}</option>
          <option value="2">{uiText("features.graph.GraphPage.nachbarschaft_2_schritte_edd4a3")}</option>
          <option value="3">{uiText("features.graph.GraphPage.nachbarschaft_3_schritte_0df84f")}</option>
        </Select>
        <Switch checked={structural} onCheckedChange={setStructural} label={uiText("features.graph.GraphPage.liveness_dependencies_4224a7")} />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-info/60" /> {uiText("features.graph.GraphPage.quelle_037889")}</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-ok/70" /> {uiText("features.graph.GraphPage.contract_gesund_0a175e")}</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-warn/70" /> {uiText("features.graph.GraphPage.eingeschrankt_7c77f8")}</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full border border-dashed border-accent/60" /> {uiText("features.graph.GraphPage.ergebnis_cd8e22")}</span>
        </span>
      </div>
      {live.stale && live.contracts && <p className="mb-2 text-xs text-warn">{uiText("features.graph.GraphPage.zustandsfarben_letzter_bekannter_stand_live_verb_243a87")}</p>}
      {src.loading ? (
        <Spinner />
      ) : full.nodes.length === 0 ? (
        <Panel><Empty title={uiText("features.graph.GraphPage.noch_nichts_darzustellen_acbf63")}>{uiText("features.graph.GraphPage.der_graph_entsteht_aus_sources_und_contracts_der_ff3f8d")}</Empty></Panel>
      ) : (
        <PanelLayout view="graph"><LayoutPanel id="graph" title={uiText("features.graph.GraphPage.graph_32ab01")} span={2}>
          <Panel className="h-[min(70vh,44rem)] min-h-[24rem] overflow-hidden">
            <ReactFlowProvider>
              <Canvas key={`${structural}-${depth}-${selected ?? ''}`} graph={graph} envelopes={live.contracts} selected={selected} onSelect={select} focus={selected ?? match?.id ?? null} />
            </ReactFlowProvider>
          </Panel>
          </LayoutPanel><LayoutPanel id="details" title={uiText("features.graph.GraphPage.knotendetails_1af0bd")} span={1}>
          {selectedNode ? <Details node={selectedNode} graph={full} envelope={selectedNode.contractId ? (live.contracts?.[selectedNode.contractId] ?? null) : null} /> : <Panel><Empty title={uiText("features.graph.GraphPage.knoten_wahlen_b5df2f")}>{uiText("features.graph.GraphPage.klicken_sie_einen_knoten_an_um_zustand_abhangigk_356431")}</Empty></Panel>}
          </LayoutPanel></PanelLayout>
      )}
    </>
  );
}

export { nodeId };
