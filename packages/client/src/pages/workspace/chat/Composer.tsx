import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { getToken } from '../../../lib/api';
import SlashAutocomplete from './SlashAutocomplete';

interface Attachment {
  id: string;
  originalName: string;
  kind: string;
}

interface Props {
  projectId: string;
  disabled: boolean;
  onSend: (text: string, attachmentIds: string[]) => void;
}

export default function Composer({ projectId, disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const showSlash = text.startsWith('/') && !text.includes(' ');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, attachments.map(a => a.id));
    setText('');
    setAttachments([]);
  }, [text, attachments, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
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
  };

  const handleSlashPick = (skillName: string) => {
    setText(`/${skillName} `);
    taRef.current?.focus();
  };

  return (
    <div className="composer">
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
        placeholder={disabled ? '回答中…' : '輸入訊息（Enter 送出，Shift+Enter 換行；輸入 / 查看技能）'}
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
