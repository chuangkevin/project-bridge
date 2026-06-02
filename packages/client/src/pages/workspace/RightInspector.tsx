import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';

interface TurnDetail {
  mode?: string;
  [key: string]: unknown;
}

export default function RightInspector() {
  const { projectId, selectedTurnId, selectedFactId, selectedSkillName, rightCollapsed, toggleRight } = useWorkspaceStore();
  const [detail, setDetail] = useState<TurnDetail | null>(null);

  const isDesignTurn = selectedTurnId != null && (detail as TurnDetail | null)?.mode === 'design';

  useEffect(() => {
    setDetail(null);
    if (!projectId) return;
    if (selectedTurnId) {
      api<TurnDetail>(`/api/projects/${projectId}/turns/${selectedTurnId}`).then(setDetail).catch(() => {});
    } else if (selectedFactId) {
      api<TurnDetail>(`/api/projects/${projectId}/facts/${selectedFactId}`).then(setDetail).catch(() => {});
    } else if (selectedSkillName) {
      api<TurnDetail>(`/api/projects/${projectId}/skills/${selectedSkillName}`).then(setDetail).catch(() => {});
    }
  }, [projectId, selectedTurnId, selectedFactId, selectedSkillName]);

  return (
    <aside className="workspace__right" data-collapsed={rightCollapsed} role="complementary" aria-label="詳細資訊">
      <div style={{ padding: 'var(--space-4)' }}>
        <button
          onClick={toggleRight}
          style={{ float: 'right', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          aria-label="收合"
        >×</button>
        {!selectedTurnId && !selectedFactId && !selectedSkillName && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            從左側選擇對話、事實或技能查看詳情。
          </div>
        )}
        {isDesignTurn && (
          <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
              標註
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              為此設計頁面的元件新增規格標註。
            </div>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              onClick={() => alert('標註工具將在 M2 完整開放。')}
              title="開啟標註工具（M2）"
            >
              ＋ 新增標註
            </button>
          </div>
        )}
        {detail !== null && (
          <pre style={{
            background: 'var(--bg-elevated)', padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)', fontSize: 11, overflow: 'auto', maxHeight: '80vh',
            color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{JSON.stringify(detail, null, 2)}</pre>
        )}
      </div>
    </aside>
  );
}
