import { Link } from 'react-router-dom';
import { useWorkspaceStore, type Mode } from '../../stores/useWorkspaceStore';

const MODE_LABELS: Record<Mode, string> = {
  consult: '顧問',
  architect: '架構',
  design: '設計',
};

export default function TopBar({ projectName }: { projectName: string }) {
  const { mode, setMode, setMobileRailOpen } = useWorkspaceStore();

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
      <select
        className="mode-tabs-mobile"
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
        aria-label="模式"
      >
        {(['consult', 'architect', 'design'] as Mode[]).map((m) => (
          <option key={m} value={m}>{MODE_LABELS[m]}</option>
        ))}
      </select>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
        <Link to="/settings" style={{ color: 'var(--text-muted)', fontSize: 13 }}>設定</Link>
      </div>
    </header>
  );
}
