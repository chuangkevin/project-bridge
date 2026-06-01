import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  share_token: string;
  owner_id?: string;
  owner_name?: string;
}

interface Props {
  project: Project;
  user: { id: string; name: string; role: string } | null;
  isReadOnly: boolean;
  forking: boolean;
  onFork: () => void;
  onLogout: () => void;
  onShare: () => void;
  onExport: () => void;
  onToggleShortcuts: () => void;
  onNameSave: (newName: string) => void;
  exportingFramework: string | null;
  children?: React.ReactNode;
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  height: '44px',
  borderBottom: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  gap: '8px',
  flexShrink: 0,
  zIndex: 100,
};

const logoStyle: React.CSSProperties = {
  width: '22px',
  height: '22px',
  background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
  borderRadius: '5px',
  flexShrink: 0,
};

const projectNameStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid transparent',
};

const btnBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '5px 10px',
  border: '1px solid var(--border-primary)',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ctaBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '5px 14px',
  border: 'none',
  borderRadius: '6px',
  background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function WorkspaceHeader({
  project,
  user,
  isReadOnly,
  forking,
  onFork,
  onLogout,
  onShare,
  onExport,
  onToggleShortcuts,
  onNameSave,
  exportingFramework,
  children,
}: Props) {
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameClick = () => {
    if (isReadOnly) return;
    setNameValue(project.name);
    setEditingName(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleNameSave = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onNameSave(trimmed);
      }
    } catch { /* silently fail */ }
  };

  return (
    <div style={headerStyle} data-testid="workspace-header">
      <div style={logoStyle} />
      <span
        style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
        onClick={() => navigate('/')}
      >
        DesignBridge
      </span>
      <span style={{ color: 'var(--border-secondary)', fontSize: '14px' }}>/</span>

      {editingName ? (
        <input
          ref={inputRef}
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onBlur={handleNameSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleNameSave();
            if (e.key === 'Escape') setEditingName(false);
          }}
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-accent)',
            borderRadius: '4px',
            padding: '2px 6px',
            outline: 'none',
            width: '200px',
          }}
          autoFocus
        />
      ) : (
        <span
          style={projectNameStyle}
          onClick={handleNameClick}
          title={isReadOnly ? undefined : '點擊重新命名'}
          data-testid="project-name"
        >
          {project.name}
        </span>
      )}

      {/* Extra content slot (e.g. presence bar) */}
      {children}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        style={btnBaseStyle}
        onClick={onToggleShortcuts}
        title="鍵盤快捷鍵 (?)"
        data-testid="shortcuts-btn"
      >
        ⌨ ?
      </button>

      {isReadOnly && (
        <button
          type="button"
          style={btnBaseStyle}
          onClick={onFork}
          disabled={forking}
          title="複製此專案到你的帳號"
          data-testid="fork-btn"
        >
          {forking ? '⟳ Fork 中...' : '⑂ Fork'}
        </button>
      )}

      <button type="button" style={btnBaseStyle} onClick={onShare} data-testid="share-btn">
        🔗 分享
      </button>

      <button
        type="button"
        style={ctaBtnStyle}
        onClick={onExport}
        disabled={!!exportingFramework}
        data-testid="export-btn"
      >
        {exportingFramework ? '匯出中…' : '↓ 匯出'}
      </button>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              maxWidth: '80px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            data-testid="current-user-name"
            title={user.name}
          >
            {user.name}
          </span>
          <button
            type="button"
            style={btnBaseStyle}
            onClick={onLogout}
            data-testid="logout-btn"
            title="登出"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}
