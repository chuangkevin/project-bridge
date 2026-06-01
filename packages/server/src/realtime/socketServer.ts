import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type Database from 'better-sqlite3';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer, db: Database.Database): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token = (socket.handshake.auth?.token as string | undefined)
      ?? (socket.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer /, '');
    if (!token) return next(new Error('AUTH_REQUIRED'));

    const row = db.prepare(`
      SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token) as { user_id: string; expires_at: string } | undefined;
    if (!row) return next(new Error('SESSION_INVALID'));

    (socket.data as { userId?: string }).userId = row.user_id;
    next();
  });

  io.on('connection', (socket: Socket) => {
    socket.on('project:join', (projectId: string) => {
      if (typeof projectId !== 'string' || !projectId) return;
      const userId = (socket.data as { userId?: string }).userId;
      const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as { owner_id: string } | undefined;
      if (!project || project.owner_id !== userId) {
        socket.emit('project:error', { code: 'NOT_FOUND' });
        return;
      }
      void socket.join(`project:${projectId}`);
      socket.emit('project:joined', { projectId });
    });
    socket.on('project:leave', (projectId: string) => {
      if (typeof projectId === 'string') void socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

export function emitToProject(projectId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

/** test-only: tear down the singleton */
export function _resetSocketServer(): void {
  if (io) {
    io.close();
    io = null;
  }
}
