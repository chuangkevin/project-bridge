import { useState } from 'react';

export type MirrorIntentSource =
  | { kind: 'url'; payload: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface MirrorIntentCardProps {
  source: MirrorIntentSource;
  suggestedMode: 'mirror' | 'ast' | undefined;
  onConfirm: (mode: 'mirror' | 'ast') => void;
  onCancel: () => void;
}

const MODE_OPTIONS: { value: 'mirror' | 'ast'; title: string; subtitle: string }[] = [
  { value: 'mirror', title: 'Mirror（鏡像）', subtitle: '1:1 完整複製，不可編輯' },
  { value: 'ast', title: 'AST（結構）', subtitle: '約 95% 還原，可對話編輯' },
];

export default function MirrorIntentCard({ source, suggestedMode, onConfirm, onCancel }: MirrorIntentCardProps): JSX.Element {
  const [mode, setMode] = useState<'mirror' | 'ast' | null>(suggestedMode ?? null);

  return (
    <div
      data-testid="mirror-intent-card"
      style={{
        border: '1px solid var(--border-accent)',
        borderRadius: 12,
        padding: 14,
        background: 'var(--bg-card)',
        fontSize: 13,
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        {source.kind === 'url' ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              偵測到網址
            </div>
            <code
              style={{
                fontSize: 12,
                background: 'var(--bg-input)',
                padding: '2px 6px',
                borderRadius: 4,
                wordBreak: 'break-all',
              }}
            >
              {source.payload}
            </code>
          </div>
        ) : (
          <img
            src={`data:${source.mimeType};base64,${source.base64}`}
            alt="截圖預覽"
            style={{ maxWidth: 160, maxHeight: 80, borderRadius: 6, border: '1px solid var(--border-primary)' }}
          />
        )}
      </div>
      <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)' }}>
        以哪種方式重現？
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: active ? 'var(--border-accent-hi, var(--accent))' : 'var(--border-subtle)',
                background: active ? 'var(--accent-glass)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 140ms, border-color 140ms',
              }}
            >
              <input
                type="radio"
                name="mirror-mode"
                checked={active}
                onChange={() => setMode(opt.value)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{opt.subtitle}</div>
              </div>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => mode && onConfirm(mode)}
          disabled={mode === null}
          aria-label="Confirm"
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            cursor: mode === null ? 'default' : 'pointer',
            background: mode === null
              ? 'var(--text-muted)'
              : 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          確認
        </button>
      </div>
    </div>
  );
}
