import { useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';

export default function ConsultStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh } = useTurns(projectId);
  const { state, send, reset } = useChatStream();

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
    await send({ projectId, mode: 'consult', text, attachmentIds });
    if (pendingUserTextRef.current) {
      await refresh();
      pendingUserTextRef.current = '';
      reset();
    }
  };

  return (
    <div className="chat">
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
