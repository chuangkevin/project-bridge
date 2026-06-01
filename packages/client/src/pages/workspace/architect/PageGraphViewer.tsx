import { ReactFlow, Background, Controls, MiniMap, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useRef } from 'react';
import { useGraphAutofit } from '../../../hooks/useGraphAutofit';

function AutoFit({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  useGraphAutofit(containerRef);
  return null;
}

export interface PageGraphPayload {
  version?: number;
  nodes: Array<{ id: string; label: string; type?: string; description?: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
}

function autoLayout(nodes: PageGraphPayload['nodes']): Record<string, { x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const out: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out[n.id] = { x: col * 220 + 40, y: row * 130 + 40 };
  });
  return out;
}

export default function PageGraphViewer({ payload }: { payload: PageGraphPayload }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = autoLayout(payload.nodes);
    const rfNodes = payload.nodes.map((n) => ({
      id: n.id,
      data: { label: n.label },
      position: positions[n.id],
      style: {
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-md)',
        padding: 8,
        fontSize: 12,
        minWidth: 120,
      },
    }));
    const rfEdges = payload.edges.map((e, i) => ({
      id: `${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: 'var(--accent)' },
      labelStyle: { fill: 'var(--text-muted)', fontSize: 11 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
    }));
    return { rfNodes, rfEdges };
  }, [payload]);

  if (payload.nodes.length === 0) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)', textAlign: 'center' }}>
        還沒有頁面節點。在下方對話請 AI 幫你規劃網站結構。
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <AutoFit containerRef={containerRef} />
        <Background color="var(--border-subtle)" gap={20} />
        <Controls />
        <MiniMap pannable zoomable style={{ background: 'var(--bg-card)' }} nodeColor="var(--accent)" />
      </ReactFlow>
    </div>
  );
}
