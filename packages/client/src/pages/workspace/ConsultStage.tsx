import { useMemo, useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useSocketSync } from '../../hooks/useSocketSync';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';

const COUNCIL_KEY = (pid: string) => `designbridge.council_enabled.${pid}`;

export default function ConsultStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh } = useTurns(projectId);
  const { state, send, reset } = useChatStream(projectId, 'consult');

  useSocketSync(projectId, { onTurn: refresh });
  // Council mode defaults to ON. Only persists OFF if user explicitly turns it off.
  const [councilEnabled, setCouncilEnabled] = useState(() => {
    if (!projectId) return true;
    const saved = localStorage.getItem(COUNCIL_KEY(projectId));
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(COUNCIL_KEY(projectId));
    setCouncilEnabled(saved === null ? true : saved === 'true');
  }, [projectId]);

  const handleCouncilChange = (val: boolean) => {
    setCouncilEnabled(val);
    if (projectId) localStorage.setItem(COUNCIL_KEY(projectId), String(val));
  };

  const pending = useMemo(() => {
    if (state.phase === 'idle') return null;
    return { userText: state.userText, state };
  }, [state]);

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    const result = await send({ projectId, mode: 'consult', text, attachmentIds, council: councilEnabled });
    if (result.ok) {
      await refresh();
      reset();
    }
    // On error: keep state.phase === 'error' so the user sees the error message;
    // the next send() call resets state.
  };

  return (
    <div className="chat">
      {/* Council toggle — custom pill switch so it's visible in dark mode */}
      <div style={{ padding: '6px var(--space-5)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          role="switch"
          aria-checked={councilEnabled}
          onClick={() => handleCouncilChange(!councilEnabled)}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            width: 36,
            height: 20,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: councilEnabled ? 'var(--accent)' : 'var(--bg-input)',
            transition: 'background 0.2s',
            flexShrink: 0,
            padding: 0,
          }}
        >
          <span style={{
            position: 'absolute',
            left: councilEnabled ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: councilEnabled ? '#fff' : 'var(--text-muted)',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </button>
        <span style={{ fontSize: 12, color: councilEnabled ? 'var(--text-accent)' : 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCouncilChange(!councilEnabled)}>
          合議模式（PM / Designer / Engineer / Moderator 四方討論）
        </span>
      </div>
      <Transcript
        turns={turns} pending={pending}
        onQuickReply={(text) => { void handleSend(text, []); }}
        quickReplyDisabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
      />
      <Composer
        projectId={projectId ?? ''}
        disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
        onSend={handleSend}
      />
    </div>
  );
}

