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

export default function MirrorIntentCard({ source, suggestedMode, onConfirm, onCancel }: MirrorIntentCardProps): JSX.Element {
  const [mode, setMode] = useState<'mirror' | 'ast' | null>(suggestedMode ?? null);

  return (
    <div
      data-testid="mirror-intent-card"
      style={{
        border: '1px solid var(--border-primary, #e2e8f0)',
        borderRadius: 8,
        padding: 12,
        margin: '8px 0',
        background: 'var(--bg-secondary, #fff)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
        {source.kind === 'url' ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
            Detected URL: <code style={{ fontSize: 12 }}>{source.payload}</code>
          </div>
        ) : (
          <img
            src={`data:${source.mimeType};base64,${source.base64}`}
            alt="screenshot preview"
            style={{ maxWidth: 160, maxHeight: 80, borderRadius: 4 }}
          />
        )}
      </div>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Reproduce as:</div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        <input
          type="radio"
          name="mirror-mode"
          checked={mode === 'mirror'}
          onChange={() => setMode('mirror')}
        />{' '}
        Mirror — 1:1, not editable
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <input
          type="radio"
          name="mirror-mode"
          checked={mode === 'ast'}
          onChange={() => setMode('ast')}
        />{' '}
        AST — ~95%, chat-editable
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={() => mode && onConfirm(mode)} disabled={mode === null}>Confirm</button>
      </div>
    </div>
  );
}
