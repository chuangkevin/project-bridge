import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useArchStore, ArchComponent } from '../stores/useArchStore';
import ComponentEditorModal from './ComponentEditorModal';
import './ArchFlowchart.css';

const TYPE_ICONS: Record<string, string> = {
  button: '🔘', input: '✏️', select: '📋', radio: '🔘', tab: '📑', card: '🃏', link: '🔗',
};

interface ArchPageNodeData {
  name: string;
  referenceFileUrl: string | null;
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
  const [expanded, setExpanded] = useState(false);
  const [editingComp, setEditingComp] = useState<ArchComponent | null | 'new'>(null);
  const { setTargetPage } = useArchStore();

  const components = data.components || [];
  const pageNames = data.pageNames || [];

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

  const handleDeleteComponent = (compId: string) => {
    const updated = components.filter(c => c.id !== compId);
    data.onComponentsChange?.(id, updated);
  };

  return (
    <div
      data-testid={`page-node-${data.name}`}
      className="arch-page-node"
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      style={{ minWidth: expanded ? 220 : undefined }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="arch-page-node__thumb">
        {data.referenceFileUrl ? (
          <img src={data.referenceFileUrl} alt="ref" />
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

        {/* Component list toggle */}
        <button
          type="button"
          className="arch-page-node__upload-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ marginTop: 4, fontSize: 11 }}
        >
          {expanded ? '▼' : '▶'} 元件 ({components.length})
        </button>

        {/* Expanded component list */}
        {expanded && (
          <div style={{ marginTop: 4, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {components.map(c => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 4, background: '#f8f6fb', cursor: 'pointer' }}
                onClick={() => setEditingComp(c)}
                title={c.description || c.name}
              >
                <span>{TYPE_ICONS[c.type] || '·'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.navigationTo && <span style={{ color: '#8E6FA7', fontSize: 10 }}>→</span>}
                {c.states.length > 0 && <span style={{ color: '#64748b', fontSize: 10 }}>{c.states.length}態</span>}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteComponent(c.id); }}
                >✕</button>
              </div>
            ))}
            <button
              type="button"
              style={{ padding: '2px 4px', border: '1px dashed #cbd5e1', borderRadius: 4, background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
              onClick={() => setEditingComp('new')}
            >+ 新增元件</button>
          </div>
        )}
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

      {/* Component Editor Modal */}
      {editingComp !== null && (
        <ComponentEditorModal
          component={editingComp === 'new' ? null : editingComp}
          pageNames={pageNames}
          onSave={handleSaveComponent}
          onCancel={() => setEditingComp(null)}
        />
      )}
    </div>
  );
}
