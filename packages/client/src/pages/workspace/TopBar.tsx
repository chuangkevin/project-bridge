import { Link, useNavigate } from 'react-router-dom';
import { useWorkspaceStore, type Mode } from '../../stores/useWorkspaceStore';
import { useAuthStore } from '../../stores/useAuthStore';

const MODE_LABELS: Record<Mode, string> = {
  consult: '顧問',
  architect: '架構',
  design: '設計',
};

export default function TopBar({ projectName }: { projectName: string }) {
  const { mode, setMode, setMobileRailOpen } = useWorkspaceStore();
  const { logout } = useAuthStore();
  const nav = useNavigate();

  return (
    <header className="workspace__top">
      <button
        aria-label="開啟側欄"
        onClick={() => setMobileRailOpen(true)}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-secondary)',
          padding: 'var(--space-2)', cursor: 'pointer', fontSize: 18,
        }}
      >☰</button>
      <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{projectName}</div>
      <div className="mode-tabs" role="tablist" aria-label="模式">
        {(['consult', 'architect', 'design'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >{MODE_LABELS[m]}</button>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
        <Link to="/settings" style={{ color: 'var(--text-muted)', fontSize: 13 }}>設定</Link>
        <button
          onClick={async () => { await logout(); nav('/login'); }}
          style={{
            background: 'transparent', border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)', padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer',
          }}
        >登出</button>
      </div>
    </header>
  );
}
