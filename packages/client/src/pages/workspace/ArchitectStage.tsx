import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import PageGraphViewer, { type PageGraphPayload } from './architect/PageGraphViewer';

export default function ArchitectStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'page-graph');

  const [graph, setGraph] = useState<PageGraphPayload | null>(null);

  useEffect(() => {
    if (!projectId || !latest) { setGraph(null); return; }
    fetchArtifactPayload<PageGraphPayload>(projectId, latest.id)
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [projectId, latest?.id]);

  const filteredTurns = turns.filter((t) => t.mode === 'architect');

  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    await send({ projectId, mode: 'architect', text, attachmentIds });
    if (pendingRef.current) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
  };

  return (
    <div className="architect">
      <div className="architect__graph">
        <div className="architect__graph-label">頁面流程 — {latest?.name ?? '尚無'}</div>
        {graph
          ? <PageGraphViewer payload={graph} />
          : (
            <div className="architect__graph-empty">
              {latest ? '載入中…' : '還沒有頁面結構。下方對話讓 AI 幫你規劃。'}
            </div>
          )
        }
      </div>
      <div className="architect__chat">
        <Transcript turns={filteredTurns} pending={pending} />
        <Composer
          projectId={projectId ?? ''}
          disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}

// Module-level ref proxy — single workspace instance so this is fine.
const pendingRef = { current: '' };
