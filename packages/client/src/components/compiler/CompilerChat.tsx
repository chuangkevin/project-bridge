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

/** 對話輸入區：尚無作用中產出時啟動一次編譯；已有作用中產出時對它套用 AST 編輯。
 *  自動偵測 URL 與圖片附件（drag-and-drop 或貼上），先讓使用者選 Mirror / AST 再送出。 */
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
    // Optimistic: show the message immediately so the user sees what they sent while compiling.
    setSent((prev) => [...prev, value]);
    setText('');
    try {
      if (hasActive) {
        await applyEdit(value);
      } else {
        await compileFromRequirement(value);
      }
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
          if (!r.ok) { setError(`Mirror 失敗：${r.reason ?? '未知原因'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        } else {
          const r = await compileAstFromUrlAction(url);
          if (!r.ok) { setError(`AST 編譯失敗：${r.reason ?? '未知原因'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        }
      } else {
        const img = { mimeType: pending.source.mimeType, base64: pending.source.base64 };
        if (mode === 'mirror') {
          const r = await compileMirrorFromImageAction(img);
          if (!r.ok) { setError(`Mirror 失敗：${r.reason ?? '未知原因'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        } else {
          const r = await compileAstFromImageAction(img);
          if (!r.ok) { setError(`AST 編譯失敗：${r.reason ?? '未知原因'}${r.detail ? ` — ${r.detail}` : ''}`); return; }
        }
      }
      setSent((prev) => [...prev, text.trim() || '（圖片附件）']);
      setText('');
      setAttachment(null);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const showEmptyState = sent.length === 0
    && text.length === 0
    && !pending
    && !attachment
    && !error
    && !isCompiling;

  return (
    <div
      data-testid="chat-drop-zone"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 12,
        gap: 10,
        width: '100%',
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
        }}
      >
        {showEmptyState && (
          <div
            style={{
              padding: '4px 2px',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--text-muted)',
            }}
          >
            在下方輸入需求，或貼上 / 拖入截圖、網址。
          </div>
        )}

        {sent.map((line, i) => (
          <div
            key={i}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.55,
              background: 'var(--accent-glass)',
              color: 'var(--text-primary)',
              alignSelf: 'flex-end',
              maxWidth: '92%',
              border: '1px solid var(--border-accent)',
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border-accent)',
            background: 'var(--bg-card)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <img
            src={`data:${attachment.mimeType};base64,${attachment.base64}`}
            alt="附件預覽"
            style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6 }}
          />
          <span style={{ flex: 1 }}>圖片已附加，送出後將選擇 Mirror / AST。</span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            移除
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
            background: 'rgba(220,38,38,0.12)',
            color: '#fca5a5',
            border: '1px solid rgba(220,38,38,0.4)',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 8,
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-card)',
        }}
      >
        <textarea
          data-testid="chat-input"
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
          placeholder={
            hasActive
              ? '描述你想對這個畫面做的調整…'
              : '描述需求、貼上 / 拖入截圖，或附上網址…'
          }
          rows={3}
          style={{
            flex: 1,
            resize: 'none',
            padding: 10,
            fontSize: 14,
            lineHeight: 1.55,
            borderRadius: 8,
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={isCompiling}
          aria-label="Send"
          style={{
            alignSelf: 'flex-end',
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: isCompiling ? 'default' : 'pointer',
            background: isCompiling
              ? 'var(--text-muted)'
              : 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
            color: '#fff',
            boxShadow: isCompiling ? 'none' : 'var(--shadow-sm)',
            minWidth: 72,
          }}
        >
          {isCompiling ? '編譯中…' : '送出'}
        </button>
      </div>
    </div>
  );
}
