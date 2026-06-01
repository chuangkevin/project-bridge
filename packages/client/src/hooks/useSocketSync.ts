import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { getToken } from '../lib/api';

interface Handlers {
  onTurn?: (payload: { id: string; mode: string }) => void;
  onFact?: (payload: { id: string; kind: string }) => void;
  onArtifact?: (payload: { id: string; kind: string; name: string }) => void;
}

export function useSocketSync(projectId: string | null, handlers: Handlers): void {
  const token = getToken();

  useEffect(() => {
    if (!projectId || !token) return;
    const s = getSocket(token);
    if (!s) return;

    const join = () => s.emit('project:join', projectId);
    if (s.connected) join();
    else s.once('connect', join);

    const onTurn = handlers.onTurn ?? (() => {});
    const onFact = handlers.onFact ?? (() => {});
    const onArtifact = handlers.onArtifact ?? (() => {});

    s.on('turn:created', onTurn);
    s.on('fact:created', onFact);
    s.on('artifact:created', onArtifact);

    return () => {
      s.emit('project:leave', projectId);
      s.off('turn:created', onTurn);
      s.off('fact:created', onFact);
      s.off('artifact:created', onArtifact);
    };
  }, [projectId, token, handlers.onTurn, handlers.onFact, handlers.onArtifact]);
}
