import React from 'react';

type Mode = 'design' | 'consultant' | 'architecture';

interface ModeItem {
  mode: Mode;
  icon: string;
  label: string;
  testId: string;
}

const MODES: ModeItem[] = [
  { mode: 'consultant', icon: '💬', label: '顧問', testId: 'mode-consultant' },
  { mode: 'design',     icon: '🎨', label: '設計', testId: 'mode-design' },
  { mode: 'architecture', icon: '🗂', label: '架構', testId: 'mode-architecture' },
];

interface Props {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const railStyle: React.CSSProperties = {
  width: '52px',
  background: 'var(--bg-root)',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  gap: '4px',
  flexShrink: 0,
  zIndex: 10,
};

export default function ModeRail({ activeMode, onModeChange }: Props) {
  return (
    <div style={railStyle} data-testid="mode-rail">
      {MODES.map(({ mode, icon, label, testId }) => {
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            data-testid={testId}
            title={label}
            style={{
              width: '38px',
              padding: '7px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              border: isActive ? '1px solid var(--border-accent-hi)' : '1px solid transparent',
              borderRadius: '8px',
              background: isActive ? 'var(--accent-glass)' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: isActive ? 'var(--text-accent)' : 'var(--text-muted)',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={() => { window.location.href = '/settings'; }}
        style={{
          width: '38px',
          padding: '7px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          border: '1px solid transparent',
          borderRadius: '8px',
          background: 'transparent',
          cursor: 'pointer',
        }}
        title="設定"
        data-testid="mode-settings"
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>⚙</span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1 }}>設定</span>
      </button>
    </div>
  );
}
