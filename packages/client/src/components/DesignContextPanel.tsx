import { useState } from 'react';
import DesignPanel from './DesignPanel';
import StyleTweakerPanel from './StyleTweakerPanel';

type SubTab = 'design' | 'style';

interface Props {
  projectId: string;
  html: string | null;
  onSaved?: () => void;
  onInjectStyles: (css: string) => void;
  onSaveStyles: (css: string) => Promise<void>;
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px 0',
  borderBottom: '1px solid var(--border-primary)',
  flexShrink: 0,
  backgroundColor: 'var(--bg-primary)',
};

const tabBtnBase: React.CSSProperties = {
  padding: '6px 12px',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const tabBtnActive: React.CSSProperties = {
  color: 'var(--text-accent)',
  borderBottom: '2px solid var(--accent)',
};

export default function DesignContextPanel({
  projectId,
  html,
  onSaved,
  onInjectStyles,
  onSaveStyles,
  onSendMessage,
  streamingMessage,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('design');
  const [compactInput, setCompactInput] = useState('');

  const handleSend = () => {
    const text = compactInput.trim();
    if (!text) return;
    onSendMessage(text);
    setCompactInput('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--glass-context)',
        backdropFilter: 'var(--glass-blur-md)',
      }}
    >
      {/* Header + sub-tabs */}
      <div style={headerStyle}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}
        >
          設計模式
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          <button
            type="button"
            data-testid="tab-design"
            style={{ ...tabBtnBase, ...(subTab === 'design' ? tabBtnActive : {}) }}
            onClick={() => setSubTab('design')}
          >
            設計
          </button>
          <button
            type="button"
            data-testid="tab-style"
            style={{
              ...tabBtnBase,
              ...(subTab === 'style' ? tabBtnActive : {}),
              ...(!html ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
            }}
            onClick={() => html && setSubTab('style')}
            disabled={!html}
          >
            樣式
          </button>
        </div>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {subTab === 'design' ? (
          <DesignPanel projectId={projectId} onSaved={onSaved} />
        ) : (
          <StyleTweakerPanel
            html={html}
            onInject={onInjectStyles}
            onSave={onSaveStyles}
          />
        )}
      </div>

      {/* Compact chat input */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-primary)',
          flexShrink: 0,
        }}
      >
        {streamingMessage && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '6px',
              padding: '6px 8px',
              background: 'var(--bg-elevated)',
              borderRadius: '5px',
            }}
          >
            {streamingMessage.slice(-120)}…
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={compactInput}
            onChange={e => setCompactInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="傳訊息給 AI…"
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              padding: '7px 10px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!compactInput.trim()}
            style={{
              padding: '7px 14px',
              background:
                'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: compactInput.trim() ? 'pointer' : 'not-allowed',
              opacity: compactInput.trim() ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            送出
          </button>
        </div>
      </div>
    </div>
  );
}
