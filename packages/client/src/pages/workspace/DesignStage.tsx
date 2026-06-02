import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import { useSocketSync } from '../../hooks/useSocketSync';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import VueSfcPreview from './design/VueSfcPreview';
import SfcSourceViewer from './design/SfcSourceViewer';
import ArtifactPicker from './design/ArtifactPicker';

export default function DesignStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { artifacts, latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'vue-sfc');

  useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sfcSource, setSfcSource] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(true);

  // Auto-select latest on update
  useEffect(() => {
    if (!selectedId && latest) setSelectedId(latest.id);
    if (selectedId && !artifacts.some(a => a.id === selectedId) && latest) setSelectedId(latest.id);
  }, [latest?.id, artifacts, selectedId]);

  // Fetch payload when selectedId changes
  useEffect(() => {
    if (!projectId || !selectedId) { setSfcSource(null); return; }
    fetchArtifactPayload<string>(projectId, selectedId)
      .then((p) => {
        // Payload may be parsed as JSON if content-type was JSON. vue-sfc has text/plain → always string.
        setSfcSource(typeof p === 'string' ? p : JSON.stringify(p, null, 2));
      })
      .catch(() => setSfcSource(null));
  }, [projectId, selectedId]);

  const filteredTurns = turns.filter((t) => t.mode === 'design');
  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    const result = await send({ projectId, mode: 'design', text, attachmentIds });
    if (result.ok) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
    // On error: keep state.phase === 'error' so the user sees the error message.
  };

  return (
    <div className="design">
      <div className="design__header">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>頁面：</span>
        <ArtifactPicker artifacts={artifacts} selectedId={selectedId} onSelect={setSelectedId} />
        <button
          onClick={() => setShowSource(!showSource)}
          style={{
            marginLeft: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >{showSource ? '隱藏原始碼' : '顯示原始碼'}</button>
      </div>

      <div className="design__split">
        <div className="design__preview">
          {sfcSource
            ? <VueSfcPreview sfc={sfcSource} key={selectedId} />
            : (
              <div className="design__empty">
                {artifacts.length === 0
                  ? '還沒有設計。在下方對話讓 AI 幫你產出 Vue + Tailwind 頁面。'
                  : '載入中…'}
              </div>
            )
          }
        </div>
        {showSource && (
          <div className="design__source">
            {sfcSource
              ? <SfcSourceViewer source={sfcSource} />
              : <div className="design__empty">沒有原始碼</div>
            }
          </div>
        )}
      </div>

      <div className="design__chat">
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

const pendingRef = { current: '' };
