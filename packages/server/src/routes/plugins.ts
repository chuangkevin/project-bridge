import { Router, type Request, type Response } from 'express';
import { loadPlugins } from '../services/pluginLoader.js';

export function buildPluginsRouter(pluginsDir: string): Router {
  const r = Router();

  r.get('/', (_req: Request, res: Response) => {
    const plugins = loadPlugins(pluginsDir).map(p => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      skillCount: p.manifest.skills ? 1 : 0,
      mcpServers: p.mcpServers.map(s => ({ name: s.name, transport: s.transport })),
    }));
    res.json({ plugins });
  });

  return r;
}
