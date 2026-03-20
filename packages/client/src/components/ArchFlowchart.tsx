import { useCallback, useRef, useState, useEffect } from 'react';
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
  onGenerate?: () => void;
  onArchDataChange?: (data: any) => void;
}

interface AnalysisSummaryPage {
  name: string;
  viewport: string;
  components: string[];
  navigationTo: string[];
  businessRules: string[];
  interactions: string[];
  dataFields: string[];
}

interface AnalysisSummary {
  pages: AnalysisSummaryPage[];
  globalRules: string[];
  documentTypes: string[];
}

export default function ArchFlowchart({ projectId, onSwitchToDesign, onGenerate, onArchDataChange }: Props) {
  const { archData, patchArchData } = useArchStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingUploadNodeId = useRef<string | null>(null);
  const [pasteActive, setPasteActive] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Use stable refs for node handlers to avoid TDZ errors when initializing nodes
  const handleRenameRef = useRef<(nodeId: string, newName: string) => void>(() => {});
  const handleUploadRefRef = useRef<(nodeId: string) => void>(() => {});
  const handleDeleteNodeRef = useRef<(nodeId: string) => void>(() => {});
  const handleViewportChangeRef = useRef<(nodeId: string, v: 'mobile' | 'desktop' | null) => void>(() => {});
  const handleComponentsChangeRef = useRef<(nodeId: string, comps: any[]) => void>(() => {});
  const versionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<{ id: string; version: number; description: string; created_at: string }[]>([]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (versionSaveTimerRef.current) clearTimeout(versionSaveTimerRef.current); };
  }, []);

  // Check if project has analysis results available for import
  useEffect(() => {
    fetch(`/api/projects/${projectId}/analysis-summary`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.pages && data.pages.length > 0) setHasAnalysis(true); })
      .catch(() => {});
  }, [projectId]);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/versions`);
      if (res.ok) { const data = await res.json(); setVersions(data.versions || []); }
    } catch {}
  }, [projectId]);

  const handleRestore = useCallback(async (versionId: string) => {
    if (!confirm('確定要還原到此版本？目前的架構會自動備份。')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/versions/${versionId}/restore`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.arch_data && onArchDataChange) onArchDataChange(data.arch_data);
        loadVersions();
      }
    } catch {}
  }, [projectId, onArchDataChange, loadVersions]);

  const toRfNodes = (nodes: ArchNode[]): Node[] =>
    nodes.map(n => ({
      id: n.id,
      type: n.nodeType,
      position: n.position,
      data: {
        name: n.name,
        referenceFileUrl: n.referenceFileUrl,
        referenceFileId: n.referenceFileId,
        viewport: n.viewport || null,
        states: n.states || [],
        components: n.components || [],
        onRename: (nodeId: string, newName: string) => handleRenameRef.current(nodeId, newName),
        onUploadRef: (nodeId: string) => handleUploadRefRef.current(nodeId),
        onDelete: (nodeId: string) => handleDeleteNodeRef.current(nodeId),
        onViewportChange: (nodeId: string, v: 'mobile' | 'desktop' | null) => handleViewportChangeRef.current(nodeId, v),
        onComponentsChange: (nodeId: string, comps: any[]) => handleComponentsChangeRef.current(nodeId, comps),
        pageNames: (archData?.nodes || []).map(n => n.name),
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
        viewport: (n.data.viewport as 'mobile' | 'desktop' | null) || null,
        states: (n.data.states as string[]) || [],
        components: (n.data.components as any[]) || [],
      })),
      edges: updatedEdges.map(e => ({ id: e.id, source: e.source, target: e.target, label: String(e.label || '') })),
    };
    patchArchData(projectId, newArchData);
    // Debounced auto-save version
    if (versionSaveTimerRef.current) clearTimeout(versionSaveTimerRef.current);
    versionSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/architecture/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: '自動儲存' }),
      }).catch(() => {});
    }, 5000);
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

  const handleViewportChange = useCallback((nodeId: string, v: 'mobile' | 'desktop' | null) => {
    setNodes(nds => {
      const updated = nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, viewport: v } } : n);
      saveChanges(updated, edges);
      return updated;
    });
  }, [edges, saveChanges]);
  handleViewportChangeRef.current = handleViewportChange;

  const handleComponentsChange = useCallback((nodeId: string, comps: any[]) => {
    setNodes(nds => {
      const updated = nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, components: comps } } : n);
      saveChanges(updated, edges);
      return updated;
    });
  }, [edges, saveChanges]);
  handleComponentsChangeRef.current = handleComponentsChange;

  const uploadFile = useCallback(async (file: File, nodeId: string) => {
    const nodeName = nodes.find(n => n.id === nodeId)?.data.name as string || '';
    const form = new FormData();
    form.append('file', file);
    form.append('page_name', nodeName);
    const res = await fetch(`/api/projects/${projectId}/architecture/upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (!data.id) return;
    const thumbnailUrl = `/api/projects/${projectId}/files/${data.id}/thumbnail`;
    setNodes(nds => {
      const updated = nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, referenceFileId: data.id, referenceFileUrl: thumbnailUrl } } : n
      );
      saveChanges(updated, edges);
      return updated;
    });
  }, [nodes, edges, projectId, saveChanges, setNodes]);

  const handleUploadRef = useCallback((nodeId: string) => {
    pendingUploadNodeId.current = nodeId;
    setPasteActive(true);
    setTimeout(() => pasteTextareaRef.current?.focus(), 50);
  }, []);
  handleUploadRefRef.current = handleUploadRef;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadNodeId.current) return;
    await uploadFile(file, pendingUploadNodeId.current);
    e.target.value = '';
    setPasteActive(false);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem || !pendingUploadNodeId.current) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    setPasteActive(false);
    await uploadFile(file, pendingUploadNodeId.current);
  }, [uploadFile]);

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

  const importFromAnalysis = useCallback(async (summary: AnalysisSummary, mode: 'replace' | 'merge') => {
    const COLS = 3;
    const SPACING_X = 280;
    const SPACING_Y = 300;
    const START_X = 50;
    const START_Y = 100;

    let existingNodes: Node[] = [];
    let existingEdges: Edge[] = [];
    const existingPageNames = new Set<string>();

    if (mode === 'merge') {
      existingNodes = [...nodes];
      existingEdges = [...edges];
      existingNodes.forEach(n => existingPageNames.add(n.data.name as string));
    }

    // Filter pages: in merge mode, skip already existing pages
    const pagesToImport = mode === 'merge'
      ? summary.pages.filter(p => !existingPageNames.has(p.name))
      : summary.pages;

    // Create a map of page name -> node id for edge creation
    const pageIdMap = new Map<string, string>();
    // Include existing nodes in the map for merge mode
    existingNodes.forEach(n => pageIdMap.set(n.data.name as string, n.id));

    const startIndex = existingNodes.length;
    const newNodes: Node[] = pagesToImport.map((page, idx) => {
      const globalIdx = startIndex + idx;
      const col = globalIdx % COLS;
      const row = Math.floor(globalIdx / COLS);
      const nodeId = `page-analysis-${idx}-${Date.now()}`;
      pageIdMap.set(page.name, nodeId);

      // Map viewport
      let viewport: 'mobile' | 'desktop' | null = null;
      if (page.viewport === 'desktop' || page.viewport === 'mobile') viewport = page.viewport;

      // Map components to ArchComponent objects
      const components = (page.components || []).map((compName, compIdx) => {
        const description = compIdx === 0 && page.businessRules?.length
          ? page.businessRules.join('\n').slice(0, 500)
          : '';
        return {
          id: `comp-${idx}-${compIdx}`,
          name: compName,
          type: 'button' as const,
          description,
          constraints: {},
          states: [],
          navigationTo: null,
        };
      });

      return {
        id: nodeId,
        type: 'page',
        position: { x: START_X + col * SPACING_X, y: START_Y + row * SPACING_Y },
        data: {
          name: page.name,
          referenceFileUrl: null,
          referenceFileId: null,
          viewport,
          states: [],
          components,
          onRename: (nId: string, newName: string) => handleRenameRef.current(nId, newName),
          onUploadRef: (nId: string) => handleUploadRefRef.current(nId),
          onDelete: (nId: string) => handleDeleteNodeRef.current(nId),
          onViewportChange: (nId: string, v: 'mobile' | 'desktop' | null) => handleViewportChangeRef.current(nId, v),
          onComponentsChange: (nId: string, comps: any[]) => handleComponentsChangeRef.current(nId, comps),
        },
      };
    });

    // Create edges from navigationTo
    const newEdges: Edge[] = [];
    for (const page of pagesToImport) {
      const sourceId = pageIdMap.get(page.name);
      if (!sourceId) continue;
      for (const target of (page.navigationTo || [])) {
        const targetId = pageIdMap.get(target);
        if (!targetId) continue;
        // Avoid duplicate edges
        const edgeId = `edge-${sourceId}-${targetId}`;
        const alreadyExists = existingEdges.some(e => e.source === sourceId && e.target === targetId);
        if (!alreadyExists) {
          newEdges.push({ id: edgeId, source: sourceId, target: targetId, type: 'default' });
        }
      }
    }

    const allNodes = [...existingNodes, ...newNodes];
    const allEdges = [...existingEdges, ...newEdges];

    setNodes(allNodes);
    setEdges(allEdges);
    saveChanges(allNodes, allEdges);
  }, [nodes, edges, setNodes, setEdges, saveChanges]);

  const handleImportFromAnalysis = useCallback(async () => {
    setImportLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/analysis-summary`);
      if (!res.ok) { alert('無法取得分析結果'); return; }
      const summary: AnalysisSummary = await res.json();
      if (!summary.pages || summary.pages.length === 0) { alert('尚無分析結果可匯入'); return; }

      const hasExistingNodes = (archData?.nodes?.length ?? 0) > 0;
      if (hasExistingNodes) {
        const choice = prompt('目前已有架構節點。\n輸入 "取代" 清除現有架構後匯入，\n輸入 "合併" 保留現有架構並加入新頁面，\n或按取消放棄。');
        if (!choice) return;
        const trimmed = choice.trim();
        if (trimmed === '取代') {
          await importFromAnalysis(summary, 'replace');
        } else if (trimmed === '合併') {
          await importFromAnalysis(summary, 'merge');
        } else {
          alert('請輸入「取代」或「合併」');
          return;
        }
      } else {
        await importFromAnalysis(summary, 'replace');
      }
    } catch (err) {
      console.error('[import] error:', err);
      alert('匯入失敗，請稍後再試');
    } finally {
      setImportLoading(false);
    }
  }, [projectId, archData, importFromAnalysis]);

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
        onViewportChange: (nodeId: string, v: 'mobile' | 'desktop' | null) => handleViewportChangeRef.current(nodeId, v),
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
        {hasAnalysis && (
          <button
            type="button"
            data-testid="import-analysis-btn"
            className="arch-flowchart-toolbar-btn"
            onClick={handleImportFromAnalysis}
            disabled={importLoading}
          >
            {importLoading ? '匯入中...' : '📥 從分析匯入'}
          </button>
        )}
        <button type="button" className="arch-flowchart-toolbar-btn" onClick={() => useArchStore.getState().setArchData(null)}>
          重新引導
        </button>
        <button type="button" className="arch-flowchart-toolbar-btn" onClick={() => { setShowVersionHistory(!showVersionHistory); if (!showVersionHistory) loadVersions(); }}>
          歷史版本
        </button>
        <button type="button" className="arch-flowchart-toolbar-btn" onClick={() => {
          fetch(`/api/projects/${projectId}/architecture/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: '手動儲存' }),
          }).then(() => { if (showVersionHistory) loadVersions(); });
        }}>
          💾 儲存版本
        </button>
        <button type="button" className="arch-flowchart-toolbar-btn-primary" onClick={onGenerate ?? onSwitchToDesign}>
          開始生成 ▶
        </button>
      </div>

      {/* Version History Panel */}
      {showVersionHistory && (
        <div style={{ position: 'absolute', top: 48, right: 8, width: 280, maxHeight: 400, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'auto', fontSize: 13 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>架構歷史版本</span>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }} onClick={() => setShowVersionHistory(false)}>&times;</button>
          </div>
          {versions.length === 0 && (
            <div style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>尚無版本記錄</div>
          )}
          {versions.map(v => (
            <div key={v.id} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>v{v.version} — {v.description}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(v.created_at).toLocaleString('zh-TW')}</div>
              </div>
              <button type="button" style={{ padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', cursor: 'pointer', fontSize: 11 }} onClick={() => handleRestore(v.id)}>還原</button>
            </div>
          ))}
        </div>
      )}

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

      {pasteActive && (
        <div className="arch-paste-overlay" onClick={() => setPasteActive(false)}>
          <div className="arch-paste-modal" onClick={e => e.stopPropagation()}>
            <p className="arch-paste-title">貼上或選擇參考圖</p>
            <p className="arch-paste-hint">按 Ctrl+V 貼上截圖，或點下方選擇檔案</p>
            <textarea
              ref={pasteTextareaRef}
              className="arch-paste-textarea"
              onPaste={handlePaste}
              readOnly
              placeholder="Ctrl+V 貼上圖片..."
            />
            <button
              type="button"
              className="arch-paste-browse-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              選擇檔案
            </button>
            <button
              type="button"
              className="arch-paste-cancel-btn"
              onClick={() => setPasteActive(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
