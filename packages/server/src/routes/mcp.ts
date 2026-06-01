import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listMcpServers } from '../services/mcpRegistry.js';

export function buildMcpRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (_req: Request, res: Response) => {
    res.json({ servers: listMcpServers() });
  });

  return r;
}
