import { useState } from 'react';
import { useCompilerStore } from '../../stores/useCompilerStore';

/** Chat input that drives the compiler: compile a new artifact when none is active,
 *  otherwise apply an AST edit to the active one. */
export default function CompilerChat() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const isCompiling = useCompilerStore((s) => s.isCompiling);
  const compileFromRequirement = useCompilerStore((s) => s.compileFromRequirement);
  const applyEdit = useCompilerStore((s) => s.applyEdit);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const hasActive = artifacts.some((a) => a.id === activeArtifactId);

  const send = async () => {
    const value = text.trim();
    if (!value || isCompiling) return;
    setError(null);
    try {
      if (hasActive) {
        await applyEdit(value);
      } else {
        await compileFromRequirement(value);
      }
      setSent((prev) => [...prev, value]);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, gap: 8 }}>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sent.map((line, i) => (
          <div
            key={i}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--accent-light, rgba(142,111,167,0.08))',
              color: 'var(--text-primary, #1e293b)',
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 13,
            background: 'rgba(220,38,38,0.1)',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <textarea
          aria-label="compiler chat input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={hasActive ? 'Describe an edit…' : 'Describe a UI to compile…'}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            padding: 8,
            fontSize: 13,
            borderRadius: 6,
            border: '1px solid var(--border-primary, #e2e8f0)',
            background: 'var(--bg-input, #fff)',
            color: 'var(--text-primary, #1e293b)',
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={isCompiling}
          style={{
            alignSelf: 'flex-end',
            padding: '8px 16px',
            fontSize: 13,
            borderRadius: 6,
            border: 'none',
            cursor: isCompiling ? 'default' : 'pointer',
            background: isCompiling ? 'var(--text-muted, #94a3b8)' : 'var(--accent, #8E6FA7)',
            color: '#fff',
          }}
        >
          {isCompiling ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
