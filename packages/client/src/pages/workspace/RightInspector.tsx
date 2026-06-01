import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';

export default function RightInspector() {
  const { projectId, selectedTurnId, selectedFactId, selectedSkillName, rightCollapsed, toggleRight } = useWorkspaceStore();
  const [detail, setDetail] = useState<unknown>(null);

  useEffect(() => {
    setDetail(null);
    if (!projectId) return;
    if (selectedTurnId) {
      api(`/api/projects/${projectId}/turns/${selectedTurnId}`).then(setDetail).catch(() => {});
    } else if (selectedFactId) {
      api(`/api/projects/${projectId}/facts/${selectedFactId}`).then(setDetail).catch(() => {});
    } else if (selectedSkillName) {
      api(`/api/projects/${projectId}/skills/${selectedSkillName}`).then(setDetail).catch(() => {});
    }
  }, [projectId, selectedTurnId, selectedFactId, selectedSkillName]);

  return (
    <aside className="workspace__right" data-collapsed={rightCollapsed}>
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
