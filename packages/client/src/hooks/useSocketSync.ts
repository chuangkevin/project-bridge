import { useEffect } from 'react';
import { getSocket } from '../lib/socket';

interface Handlers {
  onTurn?: (payload: { id: string; mode: string }) => void;
  onFact?: (payload: { id: string; kind: string }) => void;
  onArtifact?: (payload: { id: string; kind: string; name: string }) => void;
}

/**
 * Socket.io sync hook (M1 anonymous mode). No auth — the socket server
 * accepts every visitor and gates only on project existence.
 */
export function useSocketSync(projectId: string | null, handlers: Handlers): void {
  useEffect(() => {
    if (!projectId) return;
    const s = getSocket();

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
  }, [projectId, handlers.onTurn, handlers.onFact, handlers.onArtifact]);
}
