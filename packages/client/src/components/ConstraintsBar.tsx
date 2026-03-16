import { useState, useEffect } from 'react';

export interface Constraints {
  device: 'Desktop' | 'Tablet' | 'Mobile';
  color: 'Light' | 'Dark' | 'Custom';
  customColor?: string;
  language: string;
}

interface Props {
  projectId: string;
  onChange: (constraints: Constraints) => void;
}

const STORAGE_KEY_PREFIX = 'bridge-constraints-';

const defaultConstraints: Constraints = {
  device: 'Desktop',
  color: 'Light',
  language: '繁體中文',
};

export default function ConstraintsBar({ projectId, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [constraints, setConstraints] = useState<Constraints>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return { ...defaultConstraints };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + projectId, JSON.stringify(constraints));
    onChange(constraints);
  }, [constraints, projectId, onChange]);

  const update = (partial: Partial<Constraints>) => {
    setConstraints(prev => ({ ...prev, ...partial }));
  };

  return (
    <div style={styles.wrapper}>
      <button
        style={styles.toggleBtn}
        onClick={() => setExpanded(!expanded)}
        title="Toggle constraints"
        data-testid="constraints-toggle"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1 3h12M3 7h8M5 11h4" />
        </svg>
        <span>Constraints</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>
      {expanded && (
        <div style={styles.bar} data-testid="constraints-bar">
          <div style={styles.field}>
            <label style={styles.label}>Device</label>
            <select
              style={styles.select}
              value={constraints.device}
              onChange={e => update({ device: e.target.value as Constraints['device'] })}
            >
              <option value="Desktop">Desktop</option>
              <option value="Tablet">Tablet</option>
              <option value="Mobile">Mobile</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Color</label>
            <select
              style={styles.select}
              value={constraints.color}
              onChange={e => update({ color: e.target.value as Constraints['color'] })}
            >
              <option value="Light">Light</option>
              <option value="Dark">Dark</option>
              <option value="Custom">Custom</option>
            </select>
            {constraints.color === 'Custom' && (
              <input
                type="text"
                style={styles.hexInput}
                value={constraints.customColor || ''}
                onChange={e => update({ customColor: e.target.value })}
                placeholder="#3b82f6"
              />
            )}
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Language</label>
            <select
              style={styles.select}
              value={constraints.language}
              onChange={e => update({ language: e.target.value })}
            >
              <option value="繁體中文">繁體中文</option>
              <option value="English">English</option>
              <option value="日本語">日本語</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '8px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  bar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '0 16px 12px',
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748b',
    minWidth: '52px',
  },
  select: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  hexInput: {
    width: '80px',
    padding: '4px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
  },
};
