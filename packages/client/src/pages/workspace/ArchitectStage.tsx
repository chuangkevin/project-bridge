import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import { useSocketSync } from '../../hooks/useSocketSync';
import { api } from '../../lib/api';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import PageGraphViewer, { type PageGraphPayload } from './architect/PageGraphViewer';
import ArchWizard from './architect/ArchWizard';

// Debounce arch_data saves to avoid hammering the server on every small drag
const SAVE_DEBOUNCE_MS = 800;

interface ArchVersion {
  id: string;
  version: number;
  description: string;
  created_at: string;
}

export default function ArchitectStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'page-graph');

  useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts });

  const [graph, setGraph] = useState<PageGraphPayload | null>(null);
  // Architecture data saved to / loaded from the architecture endpoint
  const [archData, setArchData] = useState<PageGraphPayload | null>(null);
  const [versions, setVersions] = useState<ArchVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: load persisted arch_data from server
  useEffect(() => {
    if (!projectId) return;
    api<{ arch_data: PageGraphPayload | null }>(`/api/projects/${projectId}/architecture`)
      .then(({ arch_data }) => {
        if (arch_data) setArchData(arch_data);
      })
      .catch(() => { /* no stored data yet — silently ignore */ });
  }, [projectId]);

  // When the AI produces a new page-graph artifact, load its payload as the active graph
  useEffect(() => {
    if (!projectId || !latest) { setGraph(null); return; }
    fetchArtifactPayload<PageGraphPayload>(projectId, latest.id)
      .then((payload) => {
        setGraph(payload);
        // Also treat the AI-generated graph as the current arch_data and persist it
        setArchData(payload);
        scheduleSave(payload);
      })
      .catch(() => setGraph(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, latest?.id]);

  const scheduleSave = useCallback((data: PageGraphPayload) => {
    if (!projectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api(`/api/projects/${projectId}/architecture`, {
        method: 'PATCH',
        body: JSON.stringify({ arch_data: data }),
      }).catch((e) => console.warn('[ArchitectStage] save failed', e));
    }, SAVE_DEBOUNCE_MS);
  }, [projectId]);

  const fetchVersions = useCallback(async () => {
    if (!projectId) return;
    const res = await api<{ versions: ArchVersion[] }>(`/api/projects/${projectId}/architecture/versions`);
    setVersions(res.versions);
  }, [projectId]);

  const handleSaveVersion = async () => {
    if (!projectId || !archData) return;
    setSavingVersion(true);
    try {
      await api(`/api/projects/${projectId}/architecture/versions`, {
        method: 'POST',
        body: JSON.stringify({ description: `版本 ${new Date().toLocaleString('zh-TW')}` }),
      });
      await fetchVersions();
      setShowVersions(true);
    } catch (e) {
      console.warn('[ArchitectStage] save version failed', e);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!projectId) return;
    try {
      const res = await api<{ ok: boolean; arch_data: PageGraphPayload }>(
        `/api/projects/${projectId}/architecture/versions/${versionId}/restore`,
        { method: 'POST' },
      );
      if (res.arch_data) {
        setArchData(res.arch_data);
        setGraph(res.arch_data);
      }
      await fetchVersions();
    } catch (e) {
      console.warn('[ArchitectStage] restore failed', e);
    }
  };

  const filteredTurns = turns.filter((t) => t.mode === 'architect');

  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    const result = await send({ projectId, mode: 'architect', text, attachmentIds });
    if (result.ok) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
    // On error: keep state.phase === 'error' so the user sees the error message.
  };

  const displayGraph = graph ?? archData;

  return (
    <div className="architect">
      <div className="architect__graph">
        <div className="architect__graph-header">
          <div className="architect__graph-label">頁面流程 — {latest?.name ?? (archData ? '已儲存' : '尚無')}</div>
          <div className="architect__graph-actions">
            <button
              className="architect__btn"
              onClick={handleSaveVersion}
              disabled={savingVersion || !archData}
              title="儲存目前版本"
            >
              {savingVersion ? '儲存中…' : '儲存版本'}
            </button>
            <button
              className="architect__btn architect__btn--secondary"
              onClick={async () => {
                await fetchVersions();
                setShowVersions(v => !v);
              }}
              title="版本紀錄"
            >
              版本紀錄
            </button>
          </div>
        </div>

        {showVersions && versions.length > 0 && (
          <div className="architect__versions">
            {versions.map((v) => (
              <div key={v.id} className="architect__version-item">
                <span className="architect__version-desc">{v.description}</span>
                <span className="architect__version-date">{new Date(v.created_at).toLocaleString('zh-TW')}</span>
                <button
                  className="architect__btn architect__btn--xs"
                  onClick={() => handleRestoreVersion(v.id)}
                >
                  還原
                </button>
              </div>
            ))}
          </div>
        )}
        {showVersions && versions.length === 0 && (
          <div className="architect__versions architect__versions--empty">尚無已儲存版本</div>
        )}

        {displayGraph
          ? <PageGraphViewer payload={displayGraph} />
          : latest
            ? <div className="architect__graph-empty">載入中…</div>
            : <ArchWizard onSend={handleSend} />
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
