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
      <div style={{ padding: 'var(--space-2) var(--space-5)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={councilEnabled}
            onChange={(e) => setCouncilEnabled(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          合議模式（PM / Designer / Engineer / Moderator 四方討論）
        </label>
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
