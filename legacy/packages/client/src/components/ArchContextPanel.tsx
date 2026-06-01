import { useState } from 'react';
import ArchitectureTab from './ArchitectureTab';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
  // Compact chat
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
}

export default function ArchContextPanel({
  projectId, onSwitchToDesign, onSwitchToDesignAndGenerate, onSendMessage, streamingMessage,
}: Props) {
  const [compactInput, setCompactInput] = useState('');

  const handleSend = () => {
    const text = compactInput.trim();
    if (!text) return;
    onSendMessage(text);
    setCompactInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--glass-context)', backdropFilter: 'var(--glass-blur-md)' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-accent)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
          架構模式
        </span>
      </div>

      {/* ArchitectureTab */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ArchitectureTab
          projectId={projectId}
          onSwitchToDesign={onSwitchToDesign}
          onSwitchToDesignAndGenerate={onSwitchToDesignAndGenerate}
        />
      </div>

      {/* Compact chat input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        {streamingMessage && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: '5px' }}>
            {streamingMessage.slice(-120)}…
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={compactInput}
            onChange={e => setCompactInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
              background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
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
