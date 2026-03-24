import { getKeyCount } from './geminiKeys';

export interface QueueTask {
  id: string;
  projectId: string;
  userId: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface QueueStatus {
  pending: number;
  processing: number;
  maxConcurrent: number;
  avgMs: number;
}

export interface TaskPosition {
  position: number;
  estimatedWaitMs: number;
}

let taskIdCounter = 0;

class GenerationQueue {
  private queue: QueueTask[] = [];
  private processing: Map<string, QueueTask> = new Map();
  private maxConcurrent: number;
  private avgGenerationMs: number = 30000; // 30s average
  private completedCount: number = 0;
  private totalDurationMs: number = 0;

  constructor(maxConcurrent?: number) {
    // Default to number of API keys available
    this.maxConcurrent = maxConcurrent || Math.max(1, getKeyCount());
  }

  /** Add a new task to the queue */
  enqueue(projectId: string, userId: string | null): QueueTask {
    taskIdCounter += 1;
    const task: QueueTask = {
      id: `gen-${Date.now()}-${taskIdCounter}`,
      projectId,
      userId,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.queue.push(task);
    return task;
  }

  /** Check if we can process another task */
  canProcess(): boolean {
    return this.processing.size < this.maxConcurrent;
  }

  /** Take the next pending task from the queue and mark it as processing */
  dequeue(): QueueTask | null {
    if (!this.canProcess()) return null;
    const task = this.queue.shift();
    if (!task) return null;
    task.status = 'processing';
    task.startedAt = Date.now();
    this.processing.set(task.id, task);
    return task;
  }

  /** Mark a task as completed or failed, updating average generation time */
  complete(taskId: string, success: boolean): void {
    const task = this.processing.get(taskId);
    if (!task) return;

    task.status = success ? 'completed' : 'failed';
    task.completedAt = Date.now();
    this.processing.delete(taskId);

    // Update rolling average generation time
    if (task.startedAt) {
      const duration = task.completedAt - task.startedAt;
      this.totalDurationMs += duration;
      this.completedCount += 1;
      this.avgGenerationMs = Math.round(this.totalDurationMs / this.completedCount);
    }

    // Refresh maxConcurrent in case keys were added/removed
    this.maxConcurrent = Math.max(1, getKeyCount());
  }

  /** Get overall queue status */
  getStatus(): QueueStatus {
    // Refresh maxConcurrent
    this.maxConcurrent = Math.max(1, getKeyCount());
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      avgMs: this.avgGenerationMs,
    };
  }

  /** Get a specific task's position and estimated wait time */
  getTaskPosition(taskId: string): TaskPosition | null {
    // Check if it's currently processing
    if (this.processing.has(taskId)) {
      return { position: 0, estimatedWaitMs: 0 };
    }

    // Find in pending queue
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    const position = index + 1;
    // Estimate: tasks ahead / concurrent slots * avg time
    const slotsAvailable = Math.max(1, this.maxConcurrent);
    const estimatedWaitMs = Math.ceil(position / slotsAvailable) * this.avgGenerationMs;

    return { position, estimatedWaitMs };
  }
}

export const generationQueue = new GenerationQueue();
