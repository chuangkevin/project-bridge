import { io, type Socket } from 'socket.io-client';

/**
 * Socket.io client (M1 anonymous mode).
 *
 * No auth token — the server accepts anonymous connections. The token
 * parameter is preserved for back-compat with old callers (e.g. workspace
 * store hydration) but is now ignored.
 */

let socket: Socket | null = null;

export function getSocket(_token?: string | null): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.close();
  socket = io({ transports: ['websocket'], reconnection: true });
  return socket;
}

export function closeSocket(): void {
  if (socket) socket.close();
  socket = null;
}
