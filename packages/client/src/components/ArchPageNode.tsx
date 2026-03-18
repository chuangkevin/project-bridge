import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useArchStore } from '../stores/useArchStore';
import './ArchFlowchart.css';

interface ArchPageNodeData {
  name: string;
  referenceFileUrl: string | null;
  onRename: (id: string, name: string) => void;
  onUploadRef: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ArchPageNode({ id, data }: { id: string; data: ArchPageNodeData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { setTargetPage } = useArchStore();

  return (
    <div
      data-testid={`page-node-${data.name}`}
      className="arch-page-node"
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
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
        <button
          type="button"
          className="arch-page-node__upload-btn"
          onClick={() => data.onUploadRef(id)}
        >
          {data.referenceFileUrl ? '換參考圖' : '+ 參考圖'}
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
    </div>
  );
}
