import { useState } from 'react';
import { useCompilerStore } from '../../stores/useCompilerStore';
import MirrorIntentCard, { type MirrorIntentSource } from './MirrorIntentCard';

const URL_RE = /https?:\/\/[^\s<>"']+/;
const MIRROR_HINTS = [/照著抄/, /完整複製/, /仿這個/, /1\s*:\s*1/, /pixel[-\s]*perfect/i, /mirror/i];
const AST_HINTS = [/參考/, /像這個風格/, /套這個感/, /inspired\s*by/i];

function suggestedFor(text: string): 'mirror' | 'ast' | undefined {
  if (MIRROR_HINTS.some(r => r.test(text))) return 'mirror';
  if (AST_HINTS.some(r => r.test(text))) return 'ast';
  return undefined;
}

/** Chat input that drives the compiler: compile a new artifact when none is active,
 *  otherwise apply an AST edit to the active one. Detects URLs and shows a
 *  Mirror-vs-AST intent picker before submitting. */
export default function CompilerChat() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const isCompiling = useCompilerStore((s) => s.isCompiling);
  const compileFromRequirement = useCompilerStore((s) => s.compileFromRequirement);
  const compileMirrorFromUrl = useCompilerStore((s) => s.compileMirrorFromUrl);
  const applyEdit = useCompilerStore((s) => s.applyEdit);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [pending, setPending] = useState<null | { source: MirrorIntentSource; suggestedMode: 'mirror' | 'ast' | undefined }>(null);

  const hasActive = artifacts.some((a) => a.id === activeArtifactId);

  const send = async (): Promise<void> => {
    const value = text.trim();
    if (!value || isCompiling) return;
    setError(null);

    if (!hasActive) {
      const m = value.match(URL_RE);
      if (m) {
        setPending({ source: { kind: 'url', payload: m[0] }, suggestedMode: suggestedFor(value) });
        return;
      }
    }

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

  const confirmIntent = async (mode: 'mirror' | 'ast'): Promise<void> => {
    if (!pending) return;
    const url = pending.source.kind === 'url' ? pending.source.payload : '';
    setError(null);
    try {
      if (mode === 'mirror' && url) {
        const r = await compileMirrorFromUrl(url);
        if (!r.ok) {
          setError(`mirror failed: ${r.reason ?? 'unknown'}${r.detail ? ` — ${r.detail}` : ''}`);
          return;
        }
      } else {
        // AST path with URL is a Plan 10b feature; fall back to text-only compile for now.
        setSent((prev) => [...prev, 'AST mode for URLs lands in Plan 10b — falling back to text-only generation.']);
        await compileFromRequirement(text.trim());
      }
      setSent((prev) => [...prev, text.trim()]);
      setText('');
      setPending(null);
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

      {pending && (
        <MirrorIntentCard
          source={pending.source}
          suggestedMode={pending.suggestedMode}
          onConfirm={(m) => void confirmIntent(m)}
          onCancel={() => setPending(null)}
        />
      )}

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
