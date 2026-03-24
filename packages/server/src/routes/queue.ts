import { Router } from 'express';
import { generationQueue } from '../services/generationQueue';

const router = Router();

/** GET /api/queue/status — returns queue status */
router.get('/status', (_req, res) => {
  const status = generationQueue.getStatus();
  res.json(status);
});

/** GET /api/queue/tasks/:taskId — returns task position and estimated wait */
router.get('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const position = generationQueue.getTaskPosition(taskId);
  if (!position) {
    return res.status(404).json({ error: 'Task not found in queue' });
  }
  res.json(position);
});

export default router;
