import { useState, type DragEvent, type ClipboardEvent } from 'react';
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

interface ChatAttachment { mimeType: string; base64: string; }

function readFileAsBase64(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const [meta, b64] = result.split(',', 2);
      const mime = meta.match(/^data:([^;]+)/)?.[1] ?? file.type ?? 'image/png';
      resolve({ mimeType: mime, base64: b64 });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Chat input that drives the compiler: compile a new artifact when none is active,
 *  otherwise apply an AST edit to the active one. Detects URLs + image attachments
 *  (drag-and-drop or paste) and shows a Mirror-vs-AST intent picker before submitting. */
export default function CompilerChat() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const isCompiling = useCompilerStore((s) => s.isCompiling);
  const compileFromRequirement = useCompilerStore((s) => s.compileFromRequirement);
  const compileMirrorFromUrl = useCompilerStore((s) => s.compileMirrorFromUrl);
  const compileMirrorFromImageAction = useCompilerStore((s) => s.compileMirrorFromImageAction);
  const compileAstFromUrlAction = useCompilerStore((s) => s.compileAstFromUrlAction);
  const compileAstFromImageAction = useCompilerStore((s) => s.compileAstFromImageAction);
  const applyEdit = useCompilerStore((s) => s.applyEdit);

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [pending, setPending] = useState<null | { source: MirrorIntentSource; suggestedMode: 'mirror' | 'ast' | undefined }>(null);

  const hasActive = artifacts.some((a) => a.id === activeArtifactId);

  const handleFiles = async (files: FileList | File[]): Promise<void> => {
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        setAttachment(await readFileAsBase64(f));
        break;
      }
    }
  };

  const onDrop = (e: DragEvent): void => {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      void handleFiles(e.dataTransfer.files);
    }
  };

  const onPaste = (e: ClipboardEvent): void => {
    const items = e.clipboardData?.items ?? [];
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.type?.startsWith('image/')) {
        const f = it.getAsFile?.();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void handleFiles(files);
    }
  };

  const send = async (): Promise<void> => {
    if (isCompiling) return;
    setError(null);

    if (!hasActive) {
      if (attachment) {
        setPending({ source: { kind: 'image', mimeType: attachment.mimeType, base64: attachment.base64 }, suggestedMode: suggestedFor(text) });
        return;
      }
      const m = text.trim().match(URL_RE);
      if (m) {
        setPending({ source: { kind: 'url', payload: m[0] }, suggestedMode: suggestedFor(text) });
        return;
      }
    }

    const value = text.trim();
    if (!value) return;
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
    setError(null);
    try {
      if (pending.source.kind === 'url') {
        const url = pending.source.payload;
        if (mode === 'mirror') {
          const r = await compileMirrorFromUrl(url);
          if (!r.ok) { setError(`mirror failed: ${r.reason ?? 'unknown'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        } else {
          const r = await compileAstFromUrlAction(url);
          if (!r.ok) { setError(`AST compile failed: ${r.reason ?? 'unknown'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        }
      } else {
        const img = { mimeType: pending.source.mimeType, base64: pending.source.base64 };
        if (mode === 'mirror') {
          const r = await compileMirrorFromImageAction(img);
          if (!r.ok) { setError(`mirror failed: ${r.reason ?? 'unknown'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        } else {
          const r = await compileAstFromImageAction(img);
          if (!r.ok) { setError(`AST compile failed: ${r.reason ?? 'unknown'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        }
      }
      setSent((prev) => [...prev, text.trim() || '(image attachment)']);
      setText('');
      setAttachment(null);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      data-testid="chat-drop-zone"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, gap: 8 }}
    >
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

      {attachment && !pending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
          <img src={`data:${attachment.mimeType};base64,${attachment.base64}`} alt="attached" style={{ maxWidth: 80, maxHeight: 40, borderRadius: 4 }} />
          <span>Attached. Click Send to choose Mirror / AST.</span>
          <button type="button" onClick={() => setAttachment(null)}>Remove</button>
        </div>
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
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={hasActive ? 'Describe an edit…' : 'Describe a UI, paste/drop a screenshot, or include a URL…'}
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
