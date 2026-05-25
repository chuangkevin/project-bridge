import React from 'react';
import ConsultantContextPanel from './ConsultantContextPanel';
import DesignContextPanel from './DesignContextPanel';
import ArchContextPanel from './ArchContextPanel';
import { ChatMessage } from './ChatPanel';

type Mode = 'design' | 'consultant' | 'architecture';

interface Props {
  activeMode: Mode;
  projectId: string;
  // ConsultantContextPanel props
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  hasPrototype?: boolean;
  selectedElement?: { bridgeId: string; html: string; tagName: string } | null;
  onClearSelectedElement?: () => void;
  initialChatOnly?: boolean;
  // DesignContextPanel props
  html: string | null;
  onSaved?: () => void;
  onInjectStyles: (css: string) => void;
  onSaveStyles: (css: string) => Promise<void>;
  // Shared compact chat
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
  // ArchContextPanel props
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
  // Panel geometry
  width: number;
}

export default function ContextPanel({ activeMode, ...props }: Props) {
  const wrapperStyle: React.CSSProperties = {
    width: props.width,
    flexShrink: 0,
    borderRight: '1px solid var(--border-primary)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  };

  const renderPanel = () => {
    switch (activeMode) {
      case 'consultant':
        return (
          <ConsultantContextPanel
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
        );
      case 'design':
        return (
          <DesignContextPanel
            projectId={props.projectId}
            html={props.html}
            onSaved={props.onSaved}
            onInjectStyles={props.onInjectStyles}
            onSaveStyles={props.onSaveStyles}
            onSendMessage={props.onSendMessage}
            streamingMessage={props.streamingMessage}
          />
        );
      case 'architecture':
        return (
          <ArchContextPanel
            projectId={props.projectId}
            onSwitchToDesign={props.onSwitchToDesign}
            onSwitchToDesignAndGenerate={props.onSwitchToDesignAndGenerate}
            onSendMessage={props.onSendMessage}
            streamingMessage={props.streamingMessage}
          />
        );
    }
  };

  return (
    <div style={wrapperStyle} data-testid="context-panel">
      {renderPanel()}
    </div>
  );
}
