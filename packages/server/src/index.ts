import express, { type Express } from 'express';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db/connection.js';
import { runMigrations, defaultMigrationsDir } from './db/migrator.js';
import { initProvider } from './services/provider.js';
import { initSkillRegistry } from './services/skillRegistry.js';
import { authMiddleware } from './middleware/auth.js';
import { buildAuthRouter } from './routes/auth.js';
import { buildProjectsRouter } from './routes/projects.js';
import { buildOpenaiOAuthRouter } from './routes/openaiOAuth.js';
import { buildTurnsRouter } from './routes/turns.js';
import { buildFactsRouter } from './routes/facts.js';
import { buildSkillsRouter, buildProjectSkillsRouter } from './routes/skills.js';
import { buildMcpRouter } from './routes/mcp.js';
import { buildPluginsRouter } from './routes/plugins.js';
import { loadPlugins } from './services/pluginLoader.js';
import { initMcpRegistry } from './services/mcpRegistry.js';

export interface AppDeps {
  dataDir: string;
}

export function createApp(deps: AppDeps): Express {
  const db = openDb(deps.dataDir);
  runMigrations(db, defaultMigrationsDir());
  initProvider(db);

  const here = dirname(fileURLToPath(import.meta.url));
  const skillDeps = {
    db,
    builtinDir: join(here, '..', 'skills', 'builtin'),
    globalDir: join(deps.dataDir, 'skills', 'global'),
    pluginsDir: join(deps.dataDir, 'skills', 'plugins'),
  };
  initSkillRegistry(skillDeps);

  const pluginsRoot = join(deps.dataDir, 'skills', 'plugins');
  const plugins = loadPlugins(pluginsRoot);
  const allMcpServers = plugins.flatMap(p => p.mcpServers);
  // Async, but createApp is sync — fire and forget; failures are logged
  void initMcpRegistry(allMcpServers);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  (app as Express & { locals: { db: ReturnType<typeof openDb> } }).locals.db = db;

  app.use(authMiddleware(db));
  app.use('/api/auth', buildAuthRouter(db));
  app.use('/api/projects', buildProjectsRouter(db));
  app.use('/api/openai-oauth', buildOpenaiOAuthRouter(db));
  app.use('/api/projects/:id/turns', buildTurnsRouter(db));
  app.use('/api/projects/:id/facts', buildFactsRouter(db));
  app.use('/api/skills', buildSkillsRouter(skillDeps));
  app.use('/api/projects/:id/skills', buildProjectSkillsRouter(skillDeps));
  app.use('/api/mcp', buildMcpRouter());
  app.use('/api/plugins', buildPluginsRouter(pluginsRoot));

  app.get('/api/health', (_req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    res.json({ ok: true, db: 'ok', userCount: userCount.n });
  });

  return app;
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '127.0.0.1';
  const dataDir = process.env.DATA_DIR || './data';
  createApp({ dataDir }).listen(port, host, () => {
    console.log(`[server] listening on http://${host}:${port}  (dataDir=${dataDir})`);
  });
}
