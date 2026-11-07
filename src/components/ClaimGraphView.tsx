import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import { ExternalLink, GitBranch, ShieldCheck, Table2 } from 'lucide-react';
import type {
  GraphProjection,
  NormalizedBBox,
  ProvenanceAssertion,
} from '../types/prooflens';

interface ClaimGraphViewProps {
  graph: GraphProjection;
  provenance: ProvenanceAssertion[];
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
}

const COLUMN_X_BY_TYPE: Record<string, number> = {
  Document: 40,
  Claim: 310,
  Transaction: 310,
  VisualObservation: 310,
  FieldRevision: 310,
  Finding: 620,
  AlternativeExplanation: 910,
};

export function ClaimGraphView({
  graph,
  provenance,
  onJumpToSource,
}: ClaimGraphViewProps) {
  const [viewMode, setViewMode] = useState<'flow' | 'table'>('flow');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    graph.nodes[0]?.id || null
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) || null,
    [graph.nodes, selectedNodeId]
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    const colCounts: Record<string, number> = {};
    const fNodes: Node[] = graph.nodes.map((n) => {
      const colKey =
        n.nodeType === 'Document'
          ? 'Document'
          : n.nodeType === 'Finding'
          ? 'Finding'
          : n.nodeType === 'AlternativeExplanation'
          ? 'AlternativeExplanation'
          : 'Middle';
      const idx = colCounts[colKey] || 0;
      colCounts[colKey] = idx + 1;

      const x = COLUMN_X_BY_TYPE[n.nodeType] ?? 310;
      const y = 30 + idx * 96;

      const borderColor =
        n.status === 'discrepancy' || n.status === 'red'
          ? '#dc2626'
          : n.status === 'possible-explanation' || n.status === 'amber'
          ? '#d97706'
          : n.status === 'consistent-within-check' || n.status === 'green'
          ? '#16a34a'
          : '#cbd5e1';

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div className="text-left">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                {n.nodeType}
              </div>
              <div className="text-xs font-semibold text-slate-900 leading-snug">
                {n.label}
              </div>
              <div className="text-[11px] text-slate-600 font-mono truncate max-w-[210px]">
                {n.subtitle}
              </div>
            </div>
          ),
        },
        style: {
          background: '#ffffff',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '6px',
          padding: '8px 10px',
          width: 235,
          boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
        },
      };
    });

    const fEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.edgeType,
      labelStyle: { fontSize: 10, fill: '#475569', fontFamily: 'JetBrains Mono' },
      style: {
        stroke:
          e.edgeType === 'contradicts'
            ? '#dc2626'
            : e.edgeType === 'supports'
            ? '#16a34a'
            : '#64748b',
        strokeWidth: 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color:
          e.edgeType === 'contradicts'
            ? '#dc2626'
            : e.edgeType === 'supports'
            ? '#16a34a'
            : '#64748b',
      },
    }));

    return { flowNodes: fNodes, flowEdges: fEdges };
  }, [graph]);

  const connectedEdges = useMemo(
    () =>
      selectedNode
        ? graph.edges.filter(
            (e) => e.source === selectedNode.id || e.target === selectedNode.id
          )
        : [],
    [graph.edges, selectedNode]
  );

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Claim-Centred Evidence Graph & Source-Dependency Projection
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Read-only projection from authoritative extraction, check, and revision records. Source-backed nodes jump to page coordinates; abstract findings inspect linked records.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('flow')}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'flow'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Interactive Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Accessible Evidence Table</span>
          </button>
        </div>
      </div>

      {/* Main Graph or Keyboard-Accessible Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md overflow-hidden min-h-[460px]">
          {viewMode === 'flow' ? (
            <div className="w-full h-[460px]">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#e2e8f0" gap={18} />
                <Controls />
              </ReactFlow>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Node Type</th>
                    <th className="py-2.5 px-3">Label & Value</th>
                    <th className="py-2.5 px-3">Epistemic / Status</th>
                    <th className="py-2.5 px-3 text-right">Source Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {graph.nodes.map((node) => (
                    <tr
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`hover:bg-slate-50 cursor-pointer ${
                        selectedNodeId === node.id ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {node.nodeType}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{node.label}</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {node.subtitle}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {node.status}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {node.documentId && node.pageNumber ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToSource(
                                node.documentId!,
                                node.pageNumber!,
                                node.bbox,
                                node.label
                              );
                            }}
                            className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>View p.{node.pageNumber}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-400">Abstract node</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Node & Edge Inspector */}
        <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Selected Node & Edge Basis
            </h3>
            {!selectedNode ? (
              <p className="text-xs text-slate-500">
                Click any node in the graph or table to inspect its provenance edges and source coordinates.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-mono text-slate-500">
                    {selectedNode.nodeType} · {selectedNode.id}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {selectedNode.label}
                  </div>
                  <div className="text-xs font-mono text-slate-600 mt-0.5">
                    {selectedNode.subtitle}
                  </div>
                  {selectedNode.documentId && selectedNode.pageNumber ? (
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToSource(
                          selectedNode.documentId!,
                          selectedNode.pageNumber!,
                          selectedNode.bbox,
                          selectedNode.label
                        )
                      }
                      className="mt-2.5 px-2.5 py-1 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Open Source Page {selectedNode.pageNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Abstract claim/finding node: opens linked evidence records rather than inventing a page bounding box.
                    </p>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-1.5">
                    Connected Evidence Edges ({connectedEdges.length})
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {connectedEdges.map((edg) => (
                      <div
                        key={edg.id}
                        className="p-2.5 rounded border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="font-semibold text-slate-900">
                            {edg.edgeType}
                          </span>
                          <span className="text-slate-500">
                            {edg.epistemicStatus}
                          </span>
                        </div>
                        <div className="text-slate-700">Basis: {edg.basis}</div>
                        <div className="text-slate-500 text-[11px]">
                          Uncertainty: {edg.uncertainty}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Contextual support in the graph is not authentication.
          </div>
        </div>
      </div>

      {/* Provenance & Source Independence Review */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Source Lineage & Provenance Independence Review
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Identical amounts alone are never evidence of copying; unknown remains default
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Source Pair</th>
                <th className="py-2.5 px-4">Independence Classification</th>
                <th className="py-2.5 px-4">Stated Technical Basis</th>
                <th className="py-2.5 px-4">Epistemic Limitation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {provenance.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {p.sourceALabel} <span className="text-slate-400">↔</span>{' '}
                    {p.sourceBLabel}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    <span
                      className={`px-2 py-0.5 rounded border text-[11px] ${
                        p.independenceStatus === 'known-shared-source'
                          ? 'bg-amber-50 border-amber-200 text-amber-900 font-semibold'
                          : p.independenceStatus === 'possible-shared-source'
                          ? 'bg-amber-50/60 border-amber-200 text-amber-800'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {p.independenceStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{p.statedBasis}</td>
                  <td className="py-3 px-4 text-slate-500">{p.limitationNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
