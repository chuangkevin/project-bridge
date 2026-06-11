import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent } from 'react';
import { getToken } from '../../../lib/api';
import SlashAutocomplete from './SlashAutocomplete';

interface Attachment {
  id: string;
  originalName: string;
  kind: string;
}

export interface ReplicationIntent {
  intent: 'replicate' | 'style-only' | 'reference';
  destination?: 'new' | 'element';
  elementPath?: number[];
}

interface Props {
  projectId: string;
  disabled: boolean;
  onSend: (text: string, attachmentIds: string[], replicationIntent?: ReplicationIntent) => void;
  /** Design mode: show the 照抄 intake bar when an image/URL is present. */
  enableReplicationIntake?: boolean;
  /** Structural path of the element currently selected in the preview, if any. */
  selectedElementPath?: number[] | null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

export default function Composer({ projectId, disabled, onSend, enableReplicationIntake, selectedElementPath }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [intent, setIntent] = useState<ReplicationIntent['intent'] | null>(null);
  const [destination, setDestination] = useState<'new' | 'element'>('new');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const showSlash = text.startsWith('/') && !text.includes(' ');
  const hasMedia = attachments.some(a => a.kind === 'image') || URL_RE.test(text);
  const showIntake = !!enableReplicationIntake && hasMedia;

  // 記住使用者拖出的輸入框高度（native resize handle → ResizeObserver → localStorage）
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const saved = Number(localStorage.getItem('composer-height') || '');
    if (Number.isFinite(saved) && saved >= 40) ta.style.height = `${saved}px`;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(ta.getBoundingClientRect().height);
        if (h >= 40) localStorage.setItem('composer-height', String(h));
      });
    });
    ro.observe(ta);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    const replicationIntent: ReplicationIntent | undefined = showIntake && intent
      ? {
          intent,
          destination: intent === 'replicate' ? destination : 'new',
          ...(intent === 'replicate' && destination === 'element' && selectedElementPath?.length
            ? { elementPath: selectedElementPath }
            : {}),
        }
      : undefined;
    onSend(trimmed, attachments.map(a => a.id), replicationIntent);
    setText('');
    setAttachments([]);
    setIntent(null);
    setDestination('new');
  }, [text, attachments, disabled, onSend, showIntake, intent, destination, selectedElementPath]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || disabled) return;
    setUploading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch(`/api/projects/${projectId}/ingest`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json = await res.json() as { attachments: Attachment[] };
      setAttachments(prev => [...prev, ...json.attachments]);
    } catch (err) {
      console.error(err);
      alert('上傳失敗：' + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [projectId, disabled]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(e.target.files ?? []));
  };

  /** 剪貼簿貼圖（截圖直接 Ctrl+V）。文字貼上不受影響。 */
  const handlePaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const images = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f)
      .map((f, i) => f.name && f.name !== 'image.png'
        ? f
        : new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type || 'image/png' }));
    if (images.length === 0) return;
    e.preventDefault();
    void uploadFiles(images);
  };

  /** 拖放圖片/檔案進輸入區。 */
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void uploadFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  const handleSlashPick = (skillName: string) => {
    setText(`/${skillName} `);
    taRef.current?.focus();
  };

  const intakeBtn = (value: ReplicationIntent['intent'], label: string, hint: string) => (
    <button
      key={value}
      onClick={() => setIntent(i => (i === value ? null : value))}
      title={hint}
      className={`composer__intake-btn${intent === value ? ' composer__intake-btn--active' : ''}`}
    >{label}</button>
  );

  return (
    <div
      className={`composer${dragOver ? ' composer--dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {showIntake && (
        <div className="composer__intake">
          <span className="composer__intake-label">偵測到圖片/網址 — 要怎麼用？</span>
          {intakeBtn('replicate', '🎯 照抄', '像素級重建這個設計')}
          {intakeBtn('style-only', '🎨 只取風格', '只套用色彩字體質感，不抄版面')}
          {intakeBtn('reference', '💬 只當參考', '僅供討論，不照抄')}
          {intent === 'replicate' && (
            <select
              value={destination}
              onChange={e => setDestination(e.target.value as 'new' | 'element')}
              style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="new">產出新頁面</option>
              <option value="element" disabled={!selectedElementPath?.length}>
                插入選取區域{selectedElementPath?.length ? '' : '（先在預覽點選元素）'}
              </option>
            </select>
          )}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="composer__attachments" style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 'var(--space-5)' }}>
          {attachments.map(a => (
            <div key={a.id} className="attachment-chip">
              <span>[{a.kind}]</span>
              <span>{a.originalName}</span>
              <button onClick={() => setAttachments(p => p.filter(x => x.id !== a.id))} aria-label="移除">×</button>
            </div>
          ))}
        </div>
      )}
      {showSlash && (
        <SlashAutocomplete
          projectId={projectId}
          query={text.slice(1)}
          onPick={handleSlashPick}
          onClose={() => {}}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
        accept=".pdf,.docx,image/*"
      />
      <button
        className="composer__icon-btn"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || disabled}
        aria-label="附加檔案"
        title="附加 PDF / DOCX / 圖片"
      >📎</button>
      <textarea
        ref={taRef}
        className="composer__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={disabled ? '回答中…' : uploading ? '上傳中…' : '輸入訊息（Enter 送出；可直接貼上/拖入截圖）'}
        rows={1}
      />
      <button
        className="composer__btn"
        onClick={handleSend}
        disabled={disabled || !text.trim() || uploading}
      >送出</button>
    </div>
  );
}
