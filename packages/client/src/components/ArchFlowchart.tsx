import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './ArchFlowchart.css';
import { useArchStore, type ArchNode } from '../stores/useArchStore';
import ArchPageNode from './ArchPageNode';
import ArchComponentNode from './ArchComponentNode';

const nodeTypes = {
  page: ArchPageNode,
  component: ArchComponentNode,
};

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
}

export default function ArchFlowchart({ projectId, onSwitchToDesign }: Props) {
  const { archData, patchArchData } = useArchStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadNodeId = useRef<string | null>(null);

  // Use stable refs for node handlers to avoid TDZ errors when initializing nodes
  const handleRenameRef = useRef<(nodeId: string, newName: string) => void>(() => {});
  const handleUploadRefRef = useRef<(nodeId: string) => void>(() => {});
  const handleDeleteNodeRef = useRef<(nodeId: string) => void>(() => {});

  const toRfNodes = (nodes: ArchNode[]): Node[] =>
    nodes.map(n => ({
      id: n.id,
      type: n.nodeType,
      position: n.position,
      data: {
        name: n.name,
        referenceFileUrl: n.referenceFileUrl,
        referenceFileId: n.referenceFileId,
        states: n.states || [],
        onRename: (nodeId: string, newName: string) => handleRenameRef.current(nodeId, newName),
        onUploadRef: (nodeId: string) => handleUploadRefRef.current(nodeId),
        onDelete: (nodeId: string) => handleDeleteNodeRef.current(nodeId),
      },
    }));

  const toRfEdges = (): Edge[] =>
    (archData?.edges || []).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'default',
    }));

  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(archData?.nodes || []));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges());

  const saveChanges = useCallback((updatedNodes: Node[], updatedEdges: Edge[]) => {
    if (!archData) return;
    const newArchData = {
      ...archData,
      nodes: updatedNodes.map(n => ({
        id: n.id,
        nodeType: n.type as 'page' | 'component',
        name: n.data.name as string,
        position: n.position,
        referenceFileId: (n.data.referenceFileId as string) || null,
        referenceFileUrl: (n.data.referenceFileUrl as string) || null,
        states: (n.data.states as string[]) || [],
      })),
      edges: updatedEdges.map(e => ({ id: e.id, source: e.source, target: e.target, label: String(e.label || '') })),
    };
    patchArchData(projectId, newArchData);
  }, [archData, projectId, patchArchData]);

  const handleRename = useCallback((nodeId: string, newName: string) => {
    setNodes(nds => {
      const updated = nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, name: newName } } : n);
      saveChanges(updated, edges);
      return updated;
    });
  }, [edges, saveChanges]);
  handleRenameRef.current = handleRename;

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => {
      const updated = nds.filter(n => n.id !== nodeId);
      const updatedEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
      setEdges(updatedEdges);
      saveChanges(updated, updatedEdges);
      return updated;
    });
  }, [edges, saveChanges]);
  handleDeleteNodeRef.current = handleDeleteNode;

  const handleUploadRef = useCallback((nodeId: string) => {
    pendingUploadNodeId.current = nodeId;
    fileInputRef.current?.click();
  }, []);
  handleUploadRefRef.current = handleUploadRef;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadNodeId.current) return;
    const nodeId = pendingUploadNodeId.current;
    const nodeName = nodes.find(n => n.id === nodeId)?.data.name as string || '';
    const form = new FormData();
    form.append('file', file);
    form.append('page_name', nodeName);
    const res = await fetch(`/api/projects/${projectId}/upload`, { method: 'POST', body: form });
    const data = await res.json();
    const thumbnailUrl = `/api/projects/${projectId}/files/${data.id}/thumbnail`;
    setNodes(nds => {
      const updated = nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, referenceFileId: data.id, referenceFileUrl: thumbnailUrl } } : n
      );
      saveChanges(updated, edges);
      return updated;
    });
    e.target.value = '';
  };

  const onConnect = useCallback((connection: Connection) => {
    const newEdge = { ...connection, id: `edge-${Date.now()}` };
    setEdges(eds => {
      const updated = addEdge(newEdge, eds);
      saveChanges(nodes, updated);
      return updated;
    });
  }, [nodes, saveChanges]);

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);

  const handleAddPage = () => {
    const newNode: Node = {
      id: `page-${Date.now()}`,
      type: 'page',
      position: { x: nodes.length * 220 + 50, y: 100 },
      data: {
        name: '新頁面',
        referenceFileUrl: null,
        referenceFileId: null,
        states: [],
        onRename: (nodeId: string, newName: string) => handleRenameRef.current(nodeId, newName),
        onUploadRef: (nodeId: string) => handleUploadRefRef.current(nodeId),
        onDelete: (nodeId: string) => handleDeleteNodeRef.current(nodeId),
      },
    };
    setNodes(nds => {
      const updated = [...nds, newNode];
      saveChanges(updated, edges);
      return updated;
    });
  };

  return (
    <div data-testid="arch-flowchart" className="arch-flowchart-root">
      <div className="arch-flowchart-toolbar">
        <button type="button" data-testid="add-page-btn" className="arch-flowchart-toolbar-btn" onClick={handleAddPage}>
          + 新增頁面
        </button>
        <button type="button" className="arch-flowchart-toolbar-btn" onClick={() => useArchStore.getState().setArchData(null)}>
          重新引導
        </button>
        <button type="button" className="arch-flowchart-toolbar-btn-primary" onClick={onSwitchToDesign}>
          開始生成 ▶
        </button>
      </div>

      <div className="arch-flowchart-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#EBE3F2" gap={20} />
          <Controls />
        </ReactFlow>
      </div>

      <label htmlFor="arch-ref-upload" className="arch-flowchart-hidden">參考圖上傳</label>
      <input
        id="arch-ref-upload"
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="arch-flowchart-hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
