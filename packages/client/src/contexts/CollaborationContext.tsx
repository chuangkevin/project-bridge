import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useSocket } from './SocketContext';

export interface CollaborationMember {
  userId: string;
  userName: string;
  color: string;
}

export interface CursorInfo {
  x: number;
  y: number;
  userId: string;
  userName: string;
  color: string;
}

export interface GenerationLock {
  userId: string;
  userName: string;
}

interface CollaborationContextValue {
  members: CollaborationMember[];
  cursors: Map<string, CursorInfo>;
  generationLock: GenerationLock | null;
}

const CollaborationContext = createContext<CollaborationContextValue>({
  members: [],
  cursors: new Map(),
  generationLock: null,
});

export function useCollaboration() {
  return useContext(CollaborationContext);
}

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [members, setMembers] = useState<CollaborationMember[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorInfo>>(new Map());
  const [generationLock, setGenerationLock] = useState<GenerationLock | null>(null);

  const handlePresenceUpdate = useCallback((data: { members: CollaborationMember[] }) => {
    setMembers(data.members || []);
    // Remove cursors for users who left
    setCursors(prev => {
      const memberIds = new Set((data.members || []).map(m => m.userId));
      const next = new Map(prev);
      let changed = false;
      for (const key of next.keys()) {
        if (!memberIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleCursorMove = useCallback((data: CursorInfo) => {
    setCursors(prev => {
      const next = new Map(prev);
      next.set(data.userId, data);
      return next;
    });
  }, []);

  const handleGenerationLockUpdate = useCallback((data: { locked: boolean; holder: GenerationLock | null }) => {
    setGenerationLock(data.locked ? data.holder : null);
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('presence-update', handlePresenceUpdate);
    socket.on('cursor-move', handleCursorMove);
    socket.on('generation-lock-update', handleGenerationLockUpdate);

    return () => {
      socket.off('presence-update', handlePresenceUpdate);
      socket.off('cursor-move', handleCursorMove);
      socket.off('generation-lock-update', handleGenerationLockUpdate);
    };
  }, [socket, handlePresenceUpdate, handleCursorMove, handleGenerationLockUpdate]);

  return (
    <CollaborationContext.Provider value={{ members, cursors, generationLock }}>
      {children}
    </CollaborationContext.Provider>
  );
}
