import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useSocketSync } from '../../hooks/useSocketSync';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';

export default function ConsultStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh } = useTurns(projectId);
  const { state, send, reset } = useChatStream();

  useSocketSync(projectId, { onTurn: refresh });
  const [councilEnabled, setCouncilEnabled] = useState(false);

  const pending = useMemo(() => {
    if (state.phase === 'idle') return null;
    return { userText: pendingUserTextRef.current, state };
  }, [state]);

  // Hack to retain the user's text after send (state already cleared from composer)
  // Use a closure-stable ref that send() sets before the request kicks off.
  // Implement via outer ref:
  // (see ref below)

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingUserTextRef.current = text;
    const result = await send({ projectId, mode: 'consult', text, attachmentIds, council: councilEnabled });
    if (result.ok) {
      await refresh();
      pendingUserTextRef.current = '';
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
          onClick={() => setCouncilEnabled(v => !v)}
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
        <span style={{ fontSize: 12, color: councilEnabled ? 'var(--text-accent)' : 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => setCouncilEnabled(v => !v)}>
          合議模式（PM / Designer / Engineer / Moderator 四方討論）
        </span>
      </div>
      <Transcript turns={turns} pending={pending} />
      <Composer
        projectId={projectId ?? ''}
        disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
        onSend={handleSend}
      />
    </div>
  );
}

// Module-level ref proxy — single workspace instance so this is fine.
const pendingUserTextRef = { current: '' };
