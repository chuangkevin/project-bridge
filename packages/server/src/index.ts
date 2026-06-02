import express, { type Express } from 'express';
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initSocketServer } from './realtime/socketServer.js';
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
import { buildSkillsExportRouter } from './routes/skillsExport.js';
import { buildMcpRouter } from './routes/mcp.js';
import { buildPluginsRouter } from './routes/plugins.js';
import { buildIngestRouter } from './routes/ingest.js';
import { buildChatRouter } from './routes/chat.js';
import { buildArtifactsRouter } from './routes/artifacts.js';
import { buildBackupRouter } from './routes/backup.js';
import { buildSettingsAdminRouter } from './routes/settingsAdmin.js';
import { buildApiKeysRouter } from './routes/apiKeys.js';
import { buildOpencodeAdminRouter } from './routes/opencodeAdmin.js';
import { buildUsersRouter } from './routes/users.js';
import { buildCrawlRouter } from './routes/crawl.js';
import { buildDesignRouter } from './routes/design.js';
import { buildExportRouter } from './routes/exportRoute.js';
import { buildAnnotationsRouter } from './routes/annotations.js';
import { buildApiBindingsRouter } from './routes/apiBindings.js';
import { buildArchitectureRouter } from './routes/architectureRoute.js';
import { buildComponentsRouter, buildComponentsSaveRouter } from './routes/components.js';
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
  // skillsExport must be mounted BEFORE skills so /global/export and /global/batch
  // are matched before the catch-all /:name in the legacy skills router.
  app.use('/api/skills', buildSkillsExportRouter(skillDeps));
  app.use('/api/skills', buildSkillsRouter(skillDeps));
  app.use('/api/projects/:id/skills', buildProjectSkillsRouter(skillDeps));
  app.use('/api/mcp', buildMcpRouter(db));
  app.use('/api/plugins', buildPluginsRouter(pluginsRoot));
  app.use('/api/projects/:id/ingest', buildIngestRouter(db, deps.dataDir));
  app.use('/api/projects/:id', buildCrawlRouter(db, deps.dataDir));
  app.use('/api/projects/:id', buildDesignRouter(db, deps.dataDir));
  app.use('/api/projects/:id', buildExportRouter(db, deps.dataDir));
  app.use('/api/projects/:id/chat', buildChatRouter(db, deps.dataDir));
  app.use('/api/projects/:id/artifacts', buildArtifactsRouter(db, deps.dataDir));
  app.use('/api/projects/:id/backup', buildBackupRouter(db, deps.dataDir));
  app.use('/api/projects/:id/architecture', buildArchitectureRouter(db));
  app.use('/api/projects/:id/annotations', buildAnnotationsRouter(db));
  app.use('/api/projects/:id/api-bindings', buildApiBindingsRouter(db));
  app.use('/api/components', buildComponentsRouter(db));
  app.use('/api/projects/:id', buildComponentsSaveRouter(db, deps.dataDir));
  // More-specific settings sub-routes must be mounted BEFORE the generic
  // settingsAdmin router (which handles /api/settings/:key).
  app.use('/api/settings/api-keys', buildApiKeysRouter(db));
  app.use('/api/settings/opencode', buildOpencodeAdminRouter(db));
  app.use('/api/settings', buildSettingsAdminRouter(db));
  app.use('/api/users', buildUsersRouter(db));

  const sendHealth = (_req: express.Request, res: express.Response): void => {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    res.json({ ok: true, db: 'ok', userCount: userCount.n });
  };
  app.get('/api/health', sendHealth);
  app.get('/health', sendHealth);

  if (process.env.NODE_ENV === 'production') {
    const clientDist = join(here, '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/|\/socket\.io\/|\/health$).*/, (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '127.0.0.1';
  const dataDir = process.env.DATA_DIR || './data';
  const app = createApp({ dataDir });
  const httpServer = createServer(app);
  initSocketServer(httpServer, app.locals.db);
  httpServer.listen(port, host, () => {
    console.log(`[server] listening on http://${host}:${port}  (dataDir=${dataDir})`);
  });
}
