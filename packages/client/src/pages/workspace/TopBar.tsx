import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceStore, type Mode } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';

const MODE_LABELS: Record<Mode, string> = {
  consult: '顧問',
  architect: '架構',
  design: '設計',
};

export default function TopBar({ projectName }: { projectName: string }) {
  const { mode, setMode, setMobileRailOpen, projectId } = useWorkspaceStore();
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!projectId) return;
    setSharing(true);
    setShareMsg(null);
    try {
      const r = await api<{ shareToken: string; shareUrl: string }>(
        `/api/projects/${projectId}/share-token`,
        { method: 'POST' }
      );
      await navigator.clipboard.writeText(r.shareUrl);
      setShareMsg('已複製連結');
    } catch {
      setShareMsg('複製失敗');
    } finally {
      setSharing(false);
      setTimeout(() => setShareMsg(null), 2500);
    }
  };

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
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <button
            onClick={handleShare}
            disabled={sharing || !projectId}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="產生分享連結並複製到剪貼板"
          >
            {sharing ? '…' : '分享 🔗'}
          </button>
          {shareMsg && (
            <span style={{
              position: 'absolute',
              top: '110%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>
              {shareMsg}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, opacity: 0.6, letterSpacing: '0.03em', fontFamily: 'monospace' }}
          title="git commit hash — 回報問題時請附上這個">
          {(typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'dev')}
        </span>
        <Link to="/settings" style={{ color: 'var(--text-muted)', fontSize: 13 }}>設定</Link>
      </div>
    </header>
  );
}
