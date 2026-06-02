import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type Database from 'better-sqlite3';

/**
 * Socket.io server (M1 anonymous mode).
 *
 * Anyone can connect and join any project room. There is no per-user owner
 * gate — the workspace is anonymous-first. Project rooms are still scoped by
 * id so server-side `emitToProject` only reaches subscribed sockets.
 */

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer, db: Database.Database): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  // No auth middleware in M1 — connections are open.

  io.on('connection', (socket: Socket) => {
    socket.on('project:join', (projectId: string) => {
      if (typeof projectId !== 'string' || !projectId) return;
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId) as { id: string } | undefined;
      if (!project) {
        socket.emit('project:error', { code: 'NOT_FOUND' });
        return;
      }
      void socket.join(`project:${projectId}`);
      socket.emit('project:joined', { projectId });
    });
    socket.on('project:leave', (projectId: string) => {
      if (typeof projectId === 'string') void socket.leave(`project:${projectId}`);
    });

    // ── Cursor presence ────────────────────────────────────────────────────
    socket.on('cursor:move', (data: { projectId: string; x: number; y: number; userId?: string; color?: string }) => {
      if (!data || typeof data.projectId !== 'string') return;
      socket.to(`project:${data.projectId}`).emit('cursor:move', {
        socketId: socket.id,
        x: data.x,
        y: data.y,
        userId: data.userId,
        color: data.color ?? '#7c5cbf',
      });
    });

    socket.on('cursor:leave', (projectId: string) => {
      if (typeof projectId !== 'string') return;
      socket.to(`project:${projectId}`).emit('cursor:leave', { socketId: socket.id });
    });

    socket.on('disconnect', () => {
      // Notify all project rooms this socket was in that the cursor is gone
      for (const room of socket.rooms) {
        if (room.startsWith('project:')) {
          socket.to(room).emit('cursor:leave', { socketId: socket.id });
        }
      }
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
