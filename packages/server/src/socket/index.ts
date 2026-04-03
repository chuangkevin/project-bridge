import { Server as SocketServer, Socket } from 'socket.io';
import { RoomManager } from './roomManager';
import { GenerationLockManager } from './generationLock';

const roomManager = new RoomManager();
const lockManager = new GenerationLockManager();

export function setupSocket(io: SocketServer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.handshake.query.userId as string;
    const userName = socket.handshake.query.userName as string;
    console.log(`[socket] Connected: ${userName} (${socket.id})`);

    socket.on('join-room', (data: { projectId: string }) => {
      const { projectId } = data;
      socket.join(projectId);
      const color = roomManager.addMember(projectId, socket.id, userId, userName);
      const members = roomManager.getMembers(projectId);
      io.to(projectId).emit('presence-update', { members });
      console.log(`[socket] ${userName} joined room ${projectId}`);
    });

    socket.on('leave-room', (data: { projectId: string }) => {
      const { projectId } = data;
      socket.leave(projectId);
      roomManager.removeMember(projectId, socket.id);
      const members = roomManager.getMembers(projectId);
      io.to(projectId).emit('presence-update', { members });
    });

    socket.on('cursor-move', (data: { projectId: string; x: number; y: number }) => {
      socket.to(data.projectId).emit('cursor-move', {
        socketId: socket.id,
        userId,
        userName,
        x: data.x,
        y: data.y,
      });
    });

    socket.on('annotation-change', (data: { projectId: string; action: 'create' | 'update' | 'delete'; annotation: any }) => {
      socket.to(data.projectId).emit('annotation-change', {
        userId,
        userName,
        action: data.action,
        annotation: data.annotation,
      });
    });

    socket.on('generation-lock', (data: { projectId: string; action: 'acquire' | 'release' }) => {
      if (data.action === 'acquire') {
        const result = lockManager.acquire(data.projectId, socket.id, userId, userName);
        socket.emit('generation-lock-result', result);
        if (result.success) {
          io.to(data.projectId).emit('generation-lock-update', { locked: true, holder: { userId, userName } });
        }
      } else {
        lockManager.release(data.projectId, userId);
        io.to(data.projectId).emit('generation-lock-update', { locked: false, holder: null });
      }
    });

    socket.on('disconnect', () => {
      const releasedLocks = lockManager.releaseBySocket(socket.id);
      for (const projectId of releasedLocks) {
        io.to(projectId).emit('generation-lock-update', { locked: false, holder: null });
      }

      const rooms = roomManager.removeSocket(socket.id);
      for (const projectId of rooms) {
        const members = roomManager.getMembers(projectId);
        io.to(projectId).emit('presence-update', { members });
      }
      console.log(`[socket] Disconnected: ${socket.id}`);
    });
  });
}
