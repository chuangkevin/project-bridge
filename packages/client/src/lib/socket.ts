import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string | null): Socket | null {
  if (!token) return null;
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket) socket.close();
  currentToken = token;
  socket = io({ auth: { token }, transports: ['websocket'], reconnection: true });
  return socket;
}

export function closeSocket(): void {
  if (socket) socket.close();
  socket = null;
  currentToken = null;
}
