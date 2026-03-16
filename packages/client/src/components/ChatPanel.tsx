import { useState, useRef, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (html: string) => void;
}

export default function ChatPanel({ projectId, messages, onNewMessages, onHtmlGenerated }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
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
      };

      setLocalUserMsg(null);
      setStreamingContent('');
      onNewMessages(userMsg, assistantMsg);

      if (receivedHtml) {
        onHtmlGenerated(receivedHtml);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Still add the user message so they can see what they sent
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

  // Combine messages for display: existing + local user msg (during streaming) + streaming content
  const displayMessages = [...messages];
  if (localUserMsg) {
    displayMessages.push(localUserMsg);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.headerTitle}>Chat</h3>
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
            <div style={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              {msg.content}
            </div>
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
      <div style={styles.inputArea}>
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
  inputArea: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'flex-end',
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
};
