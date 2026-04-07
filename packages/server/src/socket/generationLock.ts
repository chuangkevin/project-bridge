interface Lock {
  userId: string;
  userName: string;
  socketId: string;
  projectId: string;
  acquiredAt: number;
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class GenerationLockManager {
  private locks = new Map<string, Lock>(); // projectId → Lock

  acquire(projectId: string, socketId: string, userId: string, userName: string): { success: boolean; holder?: { userId: string; userName: string } } {
    const existing = this.locks.get(projectId);

    // Check if existing lock has expired
    if (existing && Date.now() - existing.acquiredAt < LOCK_TIMEOUT_MS) {
      if (existing.userId === userId) return { success: true }; // same user, re-acquire
      return { success: false, holder: { userId: existing.userId, userName: existing.userName } };
    }

    this.locks.set(projectId, { userId, userName, socketId, projectId, acquiredAt: Date.now() });
    return { success: true };
  }

  release(projectId: string, userId: string): boolean {
    const lock = this.locks.get(projectId);
    if (!lock || lock.userId !== userId) return false;
    this.locks.delete(projectId);
    return true;
  }

  releaseBySocket(socketId: string): string[] {
    const released: string[] = [];
    for (const [projectId, lock] of this.locks) {
      if (lock.socketId === socketId) {
        this.locks.delete(projectId);
        released.push(projectId);
      }
    }
    return released;
  }

  getLock(projectId: string): { userId: string; userName: string } | null {
    const lock = this.locks.get(projectId);
    if (!lock) return null;
    if (Date.now() - lock.acquiredAt >= LOCK_TIMEOUT_MS) {
      this.locks.delete(projectId);
      return null;
    }
    return { userId: lock.userId, userName: lock.userName };
  }
}
