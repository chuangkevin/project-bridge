interface RoomMember {
  socketId: string;
  userId: string;
  userName: string;
  color: string;
  joinedAt: string;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
];

export class RoomManager {
  private rooms = new Map<string, Map<string, RoomMember>>();
  private socketRooms = new Map<string, Set<string>>(); // socketId → Set<projectId>

  addMember(projectId: string, socketId: string, userId: string, userName: string): string {
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, new Map());
    }
    const room = this.rooms.get(projectId)!;
    const color = COLORS[room.size % COLORS.length];
    room.set(socketId, { socketId, userId, userName, color, joinedAt: new Date().toISOString() });

    if (!this.socketRooms.has(socketId)) {
      this.socketRooms.set(socketId, new Set());
    }
    this.socketRooms.get(socketId)!.add(projectId);

    return color;
  }

  removeMember(projectId: string, socketId: string): void {
    const room = this.rooms.get(projectId);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) this.rooms.delete(projectId);
    }
    this.socketRooms.get(socketId)?.delete(projectId);
  }

  removeSocket(socketId: string): string[] {
    const rooms = Array.from(this.socketRooms.get(socketId) || []);
    for (const projectId of rooms) {
      this.removeMember(projectId, socketId);
    }
    this.socketRooms.delete(socketId);
    return rooms;
  }

  getMembers(projectId: string): Array<{ userId: string; userName: string; color: string }> {
    const room = this.rooms.get(projectId);
    if (!room) return [];
    // Deduplicate by userId (same user, multiple tabs)
    const seen = new Map<string, { userId: string; userName: string; color: string }>();
    for (const member of room.values()) {
      if (!seen.has(member.userId)) {
        seen.set(member.userId, { userId: member.userId, userName: member.userName, color: member.color });
      }
    }
    return Array.from(seen.values());
  }
}
