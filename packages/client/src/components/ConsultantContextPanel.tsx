import React from 'react';
import ChatPanel, { ChatMessage } from './ChatPanel';

interface Props {
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  hasPrototype?: boolean;
  selectedElement?: { bridgeId: string; html: string; tagName: string } | null;
  onClearSelectedElement?: () => void;
  initialChatOnly?: boolean;
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px 8px',
  borderBottom: '1px solid var(--border-primary)',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-accent)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

export default function ConsultantContextPanel(props: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--glass-context)',
      backdropFilter: 'var(--glass-blur-md)',
    }}>
      <div style={headerStyle}>
        <span style={labelStyle}>顧問模式</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ChatPanel
          projectId={props.projectId}
          messages={props.messages}
          onNewMessages={props.onNewMessages}
          onHtmlGenerated={props.onHtmlGenerated}
          pendingMessage={props.pendingMessage}
          onPendingMessageConsumed={props.onPendingMessageConsumed}
          hasPrototype={props.hasPrototype}
          selectedElement={props.selectedElement}
          onClearSelectedElement={props.onClearSelectedElement}
          initialChatOnly={props.initialChatOnly}
        />
      </div>
    </div>
  );
}
