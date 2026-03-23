import { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useArchStore, ArchComponent } from '../stores/useArchStore';
import ComponentEditorModal from './ComponentEditorModal';
import ArchLinkingOverlay from './ArchLinkingOverlay';
import './ArchFlowchart.css';



interface ArchPageNodeData {
  name: string;
  referenceFileUrl: string | null;
  projectId?: string;
  viewport?: 'mobile' | 'desktop' | null;
  components?: ArchComponent[];
  onRename: (id: string, name: string) => void;
  onUploadRef: (id: string) => void;
  onDelete: (id: string) => void;
  onViewportChange: (id: string, v: 'mobile' | 'desktop' | null) => void;
  onComponentsChange?: (id: string, components: ArchComponent[]) => void;
  pageNames?: string[];
}

export default function ArchPageNode({ id, data }: { id: string; data: ArchPageNodeData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<ArchComponent | null | 'new'>(null);
  const [protoHtml, setProtoHtml] = useState<string | null>(null);
  const [linkingOpen, setLinkingOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setTargetPage } = useArchStore();

  const components = data.components || [];
  const pageNames = data.pageNames || [];

  // Lazy-load prototype HTML for thumbnail preview
  useEffect(() => {
    if (data.referenceFileUrl || !data.projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${data.projectId}/prototype`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.html) setProtoHtml(d.html); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data.projectId, data.referenceFileUrl]);

  // After iframe loads, navigate to the correct page
  const handleIframeLoad = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'navigate', page: data.name }, '*');
    iframeRef.current?.contentWindow?.postMessage({ type: 'navigate-page', page: data.name }, '*');
  };

  const handleViewportChange = (v: 'mobile' | 'desktop' | null) => {
    data.onViewportChange(id, data.viewport === v ? null : v);
  };

  const handleSaveComponent = (comp: ArchComponent) => {
    let updated: ArchComponent[];
    if (editingComp === 'new') {
      updated = [...components, comp];
    } else {
      updated = components.map(c => c.id === comp.id ? comp : c);
    }
    data.onComponentsChange?.(id, updated);
    setEditingComp(null);
  };

  return (
    <div
      data-testid={`page-node-${data.name}`}
      className="arch-page-node"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); }}
      style={{}}
    >
      <Handle type="target" position={Position.Left} />

      <div className="arch-page-node__thumb">
        {data.referenceFileUrl ? (
          <img src={data.referenceFileUrl} alt="ref" />
        ) : protoHtml ? (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', borderRadius: 4 }}>
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin"
              srcDoc={protoHtml}
              title={data.name}
              onLoad={handleIframeLoad}
              style={{
                width: '1440px',
                height: '900px',
                transform: 'scale(0.138) translateX(-3px)',
                transformOrigin: '0 0',
                pointerEvents: 'none',
                border: 'none',
              }}
            />
          </div>
        ) : (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#B0B0B0" strokeWidth="1.5">
            <rect x="4" y="4" width="24" height="24" rx="3" />
            <line x1="4" y1="10" x2="28" y2="10" />
            <rect x="8" y="14" width="16" height="2" rx="1" />
            <rect x="8" y="19" width="10" height="2" rx="1" />
          </svg>
        )}
      </div>

      <div className="arch-page-node__body">
        <p
          className="arch-page-node__name"
          onDoubleClick={() => {
            const newName = window.prompt('頁面名稱', data.name);
            if (newName?.trim()) data.onRename(id, newName.trim());
          }}
          title="雙擊改名"
        >
          {data.name}
        </p>
        <div className="arch-page-node__viewport-toggle">
          {(['mobile', 'desktop'] as const).map(v => (
            <button
              key={v}
              type="button"
              className={`arch-page-node__viewport-btn${data.viewport === v ? ' arch-page-node__viewport-btn--active' : ''}`}
              onClick={() => handleViewportChange(v)}
            >
              {v === 'mobile' ? '📱 手機' : '💻 電腦'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="arch-page-node__upload-btn"
          onClick={() => data.onUploadRef(id)}
        >
          {data.referenceFileUrl ? '換參考圖' : '+ 參考圖'}
        </button>

        {/* Navigation connections summary + open linking overlay */}
        <button
          type="button"
          className="arch-page-node__upload-btn"
          onClick={() => setLinkingOpen(true)}
          style={{ marginTop: 4, fontSize: 11, background: components.filter(c=>c.navigationTo).length > 0 ? '#EBE3F2' : undefined, color: components.filter(c=>c.navigationTo).length > 0 ? '#8E6FA7' : undefined }}
        >
          🔗 設定導航 {components.filter(c => c.navigationTo).length > 0 && `(${components.filter(c => c.navigationTo).length})`}
        </button>
      </div>

      <Handle type="source" position={Position.Right} />

      {menuOpen && (
        <>
          <div className="arch-page-node__menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="arch-page-node__menu">
            {[
              { label: '改名', action: () => { const n = window.prompt('頁面名稱', data.name); if (n?.trim()) data.onRename(id, n.trim()); } },
              { label: '刪除', action: () => data.onDelete(id) },
              { label: '換參考圖', action: () => data.onUploadRef(id) },
              { label: '前往此頁面', action: () => setTargetPage(data.name) },
            ].map(item => (
              <button
                type="button"
                key={item.label}
                className="arch-page-node__menu-item"
                onClick={() => { setMenuOpen(false); item.action(); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Component Editor Modal (for advanced: states/constraints) */}
      {editingComp !== null && (
        <ComponentEditorModal
          component={editingComp === 'new' ? null : editingComp}
          pageNames={pageNames}
          onSave={handleSaveComponent}
          onCancel={() => setEditingComp(null)}
        />
      )}

      {/* Visual linking overlay */}
      {linkingOpen && data.projectId && (
        <ArchLinkingOverlay
          projectId={data.projectId}
          pageName={data.name}
          pageNames={pageNames}
          components={components}
          onUpdate={(updated) => data.onComponentsChange?.(id, updated)}
          onClose={() => setLinkingOpen(false)}
        />
      )}
    </div>
  );
}
