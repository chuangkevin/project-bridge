import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  joinRoom: (projectId: string) => void;
  leaveRoom: (projectId: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  joinRoom: () => {},
  leaveRoom: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({
  children,
  userId,
  userName,
}: {
  children: ReactNode;
  userId?: string;
  userName?: string;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const currentRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const socket = io(window.location.origin, {
      query: { userId, userName: userName || 'Anonymous' },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setConnected(true);
      // Rejoin room on reconnect
      if (currentRoomRef.current) {
        socket.emit('join-room', { projectId: currentRoomRef.current });
      }
    });
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, userName]);

  const joinRoom = (projectId: string) => {
    currentRoomRef.current = projectId;
    socketRef.current?.emit('join-room', { projectId });
  };

  const leaveRoom = (projectId: string) => {
    socketRef.current?.emit('leave-room', { projectId });
    currentRoomRef.current = null;
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, joinRoom, leaveRoom }}>
      {children}
    </SocketContext.Provider>
  );
}
