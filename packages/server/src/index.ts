import express, { type Express } from 'express';
import { pathToFileURL } from 'node:url';
import { openDb } from './db/connection.js';
import { runMigrations, defaultMigrationsDir } from './db/migrator.js';
import { initProvider } from './services/provider.js';
import { authMiddleware } from './middleware/auth.js';
import { buildAuthRouter } from './routes/auth.js';
import { buildProjectsRouter } from './routes/projects.js';
import { buildOpenaiOAuthRouter } from './routes/openaiOAuth.js';
import { buildTurnsRouter } from './routes/turns.js';
import { buildFactsRouter } from './routes/facts.js';

export interface AppDeps {
  dataDir: string;
}

export function createApp(deps: AppDeps): Express {
  const db = openDb(deps.dataDir);
  runMigrations(db, defaultMigrationsDir());
  initProvider(db);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  (app as Express & { locals: { db: ReturnType<typeof openDb> } }).locals.db = db;

  app.use(authMiddleware(db));
  app.use('/api/auth', buildAuthRouter(db));
  app.use('/api/projects', buildProjectsRouter(db));
  app.use('/api/openai-oauth', buildOpenaiOAuthRouter(db));
  app.use('/api/projects/:id/turns', buildTurnsRouter(db));
  app.use('/api/projects/:id/facts', buildFactsRouter(db));

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
