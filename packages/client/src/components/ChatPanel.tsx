import { useState, useRef, useEffect, useCallback } from 'react';
import ConstraintsBar, { Constraints } from './ConstraintsBar';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  messageType?: 'user' | 'generate' | 'answer';
}

interface UploadedFile {
  id: string;
  filename: string;
  extractedText?: string;
}

interface ArtStyle {
  summary: string;
  applyStyle: boolean;
}

interface Props {
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
}

export default function ChatPanel({ projectId, messages, onNewMessages, onHtmlGenerated }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [viewingFile, setViewingFile] = useState<UploadedFile | null>(null);
  const [editedText, setEditedText] = useState('');
  const [constraints, setConstraints] = useState<Constraints | null>(null);
  const [artStyle, setArtStyle] = useState<ArtStyle | null>(null);
  const [artStyleLoading, setArtStyleLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const fetchArtStyle = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/art-style`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.summary) {
          setArtStyle({ summary: data.summary, applyStyle: !!data.applyStyle });
        }
      }
    } catch {
      // silently fail
    }
  }, [projectId]);

  useEffect(() => {
    fetchArtStyle();
  }, [fetchArtStyle]);

  const handleArtStyleToggle = useCallback(async (enabled: boolean) => {
    setArtStyleLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/art-style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyStyle: enabled }),
      });
      setArtStyle(prev => prev ? { ...prev, applyStyle: enabled } : null);
    } catch {
      // silently fail
    } finally {
      setArtStyleLoading(false);
    }
  }, [projectId]);

  const handleConstraintsChange = useCallback((c: Constraints) => {
    setConstraints(c);
  }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress since fetch doesn't support progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 20, 90));
      }, 200);

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      setAttachedFiles(prev => [...prev, {
        id: data.id,
        filename: data.filename,
        extractedText: data.extractedText,
      }]);

      // Refetch art style in case a new image was uploaded
      fetchArtStyle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
    // Reset so same file can be selected again
    e.target.value = '';
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setError(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setLocalUserMsg(userMsg);

    const fileIds = attachedFiles.map(f => f.id);
    const sentFiles = [...attachedFiles];

    // Clear attached files after sending
    setAttachedFiles([]);

    try {
      const body: Record<string, unknown> = { message: text };
      if (fileIds.length > 0) {
        body.fileIds = fileIds;
      }
      if (constraints) {
        body.constraints = constraints;
      }

      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Chat request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';
      let receivedHtml: string | null = null;
      let receivedMessageType: 'user' | 'generate' | 'answer' | undefined;
      let receivedIsMultiPage = false;
      let receivedPages: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              setError(data.error);
              break;
            }
            if (data.content) {
              fullContent += data.content;
              setStreamingContent(fullContent);
            }
            if (data.done) {
              if (data.html) {
                receivedHtml = data.html;
              }
              if (data.messageType) {
                receivedMessageType = data.messageType;
              }
              if (data.isMultiPage !== undefined) {
                receivedIsMultiPage = !!data.isMultiPage;
              }
              if (data.pages) {
                receivedPages = data.pages;
              }
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        messageType: receivedMessageType,
      };

      setLocalUserMsg(null);
      setStreamingContent('');
      onNewMessages(userMsg, assistantMsg);

      if (receivedHtml) {
        onHtmlGenerated({ html: receivedHtml, isMultiPage: receivedIsMultiPage, pages: receivedPages });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Restore files on error
      setAttachedFiles(sentFiles);
      setLocalUserMsg(null);
      onNewMessages(userMsg, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setStreaming(false);
    }
  };

  const [localUserMsg, setLocalUserMsg] = useState<ChatMessage | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayMessages = [...messages];
  if (localUserMsg) {
    displayMessages.push(localUserMsg);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.headerTitle}>Chat</h3>
      </div>

      {/* Art Style Card */}
      {artStyle && artStyle.summary && (
        <div style={styles.artStyleCard} data-testid="art-style-card">
          <div style={styles.artStyleTop}>
            <span style={styles.artStyleTitle}>🎨 偵測到美術風格</span>
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={artStyle.applyStyle}
                onChange={e => handleArtStyleToggle(e.target.checked)}
                disabled={artStyleLoading}
                style={styles.toggleInput}
                aria-label="Apply art style"
                data-testid="art-style-toggle"
              />
              <span style={{
                ...styles.toggleSlider,
                backgroundColor: artStyle.applyStyle ? '#3b82f6' : '#cbd5e1',
              }} />
            </label>
          </div>
          <p style={styles.artStyleSummary}>{artStyle.summary}</p>
        </div>
      )}

      {/* Drop zone */}
      <div
        style={{
          ...styles.dropZone,
          borderColor: dragOver ? '#3b82f6' : '#cbd5e1',
          backgroundColor: dragOver ? '#eff6ff' : '#f8fafc',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="drop-zone"
      >
        <span style={styles.dropText}>
          {dragOver ? 'Drop file here' : 'Drag & drop files here'}
        </span>
      </div>

      <div style={styles.messageList}>
        {displayMessages.length === 0 && !streaming && (
          <div style={styles.emptyChat}>
            <p style={styles.emptyChatText}>Describe your UI to start generating a prototype.</p>
          </div>
        )}
        {displayMessages.map(msg => (
          <div
            key={msg.id}
            style={msg.role === 'user' ? styles.userMsgRow : styles.assistantMsgRow}
          >
            {msg.role === 'user' ? (
              <div style={styles.userBubble}>
                {msg.content}
              </div>
            ) : msg.messageType === 'answer' ? (
              <div style={styles.answerBubble}>
                <span style={styles.answerLabel}>💬 回答</span>
                {msg.content}
              </div>
            ) : msg.messageType === 'generate' ? (
              <div style={styles.generateBubble}>
                {msg.content}
                <div><span style={styles.generateTag}>✅ 已生成原型</span></div>
              </div>
            ) : (
              <div style={styles.assistantBubble}>
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {streaming && streamingContent && (
          <div style={styles.assistantMsgRow}>
            <div style={styles.assistantBubble}>
              {streamingContent}
              <span style={styles.cursor}>|</span>
            </div>
          </div>
        )}
        {streaming && !streamingContent && (
          <div style={styles.assistantMsgRow}>
            <div style={styles.assistantBubble}>
              <span style={styles.thinking}>Thinking...</span>
            </div>
          </div>
        )}
        {error && (
          <div style={styles.errorRow}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ConstraintsBar projectId={projectId} onChange={handleConstraintsChange} />

      {/* Attached files chips */}
      {attachedFiles.length > 0 && (
        <div style={styles.fileChips}>
          {attachedFiles.map(f => (
            <div key={f.id} style={styles.fileChip} data-testid="file-chip">
              <span style={styles.fileName}>{f.filename}</span>
              {f.extractedText && (
                <button
                  style={styles.extractedBadge}
                  onClick={() => { setViewingFile(f); setEditedText(f.extractedText || ''); }}
                >
                  Text extracted
                </button>
              )}
              <button
                style={styles.removeFileBtn}
                onClick={() => setAttachedFiles(prev => prev.filter(x => x.id !== f.id))}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div style={styles.uploadProgress}>
          <div style={{ ...styles.uploadBar, width: `${uploadProgress}%` }} />
        </div>
      )}

      <div style={styles.inputArea}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          data-testid="file-input"
        />
        <button
          style={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          disabled={uploading || streaming}
          data-testid="attach-file-btn"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 8.5l-5.5 5.5a3.5 3.5 0 01-5-5L9 3.5a2.33 2.33 0 013.3 3.3L6.8 12.3a1.17 1.17 0 01-1.6-1.6L10.7 5" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your UI..."
          rows={2}
          disabled={streaming}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: (!input.trim() || streaming) ? 0.5 : 1,
          }}
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          data-testid="send-btn"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 9l6-6v4h8v4H8v4L2 9z" fill="white" />
          </svg>
        </button>
      </div>

      {/* File text modal */}
      {viewingFile && (
        <div style={styles.modalOverlay} onClick={() => setViewingFile(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{viewingFile.filename}</h3>
            <textarea
              style={styles.modalTextarea}
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              rows={12}
            />
            <div style={styles.modalActions}>
              <button style={styles.modalCancelBtn} onClick={() => setViewingFile(null)}>Close</button>
              <button
                style={styles.modalSaveBtn}
                onClick={() => {
                  setAttachedFiles(prev =>
                    prev.map(f => f.id === viewingFile.id ? { ...f, extractedText: editedText } : f)
                  );
                  setViewingFile(null);
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  artStyleCard: {
    margin: '8px 12px 0',
    padding: '10px 12px',
    backgroundColor: '#fafafa',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
  },
  artStyleTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  artStyleTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#1e293b',
  },
  artStyleSummary: {
    margin: 0,
    fontSize: '11px',
    color: '#64748b',
    lineHeight: '1.4',
  },
  toggleLabel: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    width: '36px',
    height: '20px',
    flexShrink: 0,
  },
  toggleInput: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  toggleSlider: {
    position: 'absolute',
    inset: 0,
    borderRadius: '10px',
    transition: 'background-color 0.2s',
  },
  dropZone: {
    margin: '8px 12px 0',
    padding: '10px',
    border: '2px dashed #cbd5e1',
    borderRadius: '8px',
    textAlign: 'center' as const,
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  dropText: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyChat: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyChatText: {
    color: '#94a3b8',
    fontSize: '14px',
    textAlign: 'center',
  },
  userMsgRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantMsgRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  userBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    borderRadius: '14px 14px 4px 14px',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  assistantBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: '#e2e8f0',
    color: '#1e293b',
    borderRadius: '14px 14px 14px 4px',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflowY: 'auto',
  },
  answerBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: '#eff6ff',
    color: '#1e293b',
    borderRadius: '14px 14px 14px 4px',
    borderLeft: '3px solid #3b82f6',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: 'inherit',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  generateBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    borderRadius: '14px 14px 14px 4px',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  generateTag: {
    display: 'inline-block',
    marginTop: '6px',
    padding: '2px 8px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600 as const,
  },
  answerLabel: {
    fontSize: '11px',
    color: '#3b82f6',
    fontWeight: 600 as const,
    marginBottom: '4px',
    display: 'block',
  },
  cursor: {
    animation: 'blink 1s infinite',
    color: '#64748b',
  },
  thinking: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  errorRow: {
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
  },
  errorText: {
    margin: 0,
    fontSize: '13px',
    color: '#ef4444',
  },
  fileChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    padding: '6px 16px',
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: '#e2e8f0',
    borderRadius: '14px',
    fontSize: '12px',
    color: '#1e293b',
  },
  fileName: {
    fontWeight: 500,
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  extractedBadge: {
    padding: '1px 6px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeFileBtn: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
  },
  uploadProgress: {
    margin: '0 16px 4px',
    height: '3px',
    backgroundColor: '#e2e8f0',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  uploadBar: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '2px',
    transition: 'width 0.2s',
  },
  inputArea: {
    display: 'flex',
    gap: '6px',
    padding: '12px 16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'flex-end',
  },
  attachBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    cursor: 'pointer',
    flexShrink: 0,
    color: '#64748b',
  },
  textarea: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    width: '480px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    margin: '0 0 12px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  modalTextarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    lineHeight: '1.5',
    boxSizing: 'border-box' as const,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '12px',
  },
  modalCancelBtn: {
    padding: '6px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    cursor: 'pointer',
  },
  modalSaveBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
