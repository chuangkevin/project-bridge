import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { runMigrations } from './db/migrate';
import projectsRouter from './routes/projects';
import chatRouter from './routes/chat';
import shareRouter from './routes/share';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import annotationsRouter from './routes/annotations';
import designRouter from './routes/design';
import artStyleRouter from './routes/artStyle';
import globalDesignRouter from './routes/globalDesign';
import prototypesRouter from './routes/prototypes';
import platformShellRouter from './routes/platformShell';
import architectureRouter from './routes/architecture';
import crawlRouter from './routes/crawl';
import apiBindingsRouter from './routes/apiBindings';
import componentDependenciesRouter from './routes/componentDependencies';
import elementConstraintsRouter from './routes/elementConstraints';
import exportRouter from './routes/export'; // eslint-disable-line @typescript-eslint/no-unused-vars
import patchesRouter from './routes/patches';
import usersRouter from './routes/users';
import forkRouter from './routes/fork';
import pageMappingsRouter from './routes/pageMappings';
import skillsRouter from './routes/skills';
import preferencesRouter from './routes/preferences';
import promptTemplatesRouter from './routes/promptTemplates';
import queueRouter from './routes/queue';
import designPresetsRouter from './routes/designPresets';
import componentsRouter, { projectComponentsRouter } from './routes/components';
import { authMiddleware } from './middleware/auth';
import { syncSkillsFromDirectory } from './services/skillSync';
import { HOUSEPRICE_DESIGN_SYSTEM_V2 } from './services/designSystemV2';
import db from './db/connection';
import { setupSocket } from './socket';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});
setupSocket(io);
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware); // populate req.user from bearer token (transparent, non-blocking)

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', chatRouter);
app.use('/api/share', shareRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/projects', uploadRouter);
app.use('/api/projects', annotationsRouter);
app.use('/api/projects', designRouter);
app.use('/api/projects', artStyleRouter);
app.use('/api/global-design', globalDesignRouter);
app.use('/api/projects', prototypesRouter);
app.use('/api/projects', platformShellRouter);
app.use('/api/projects', architectureRouter);
app.use('/api/projects', crawlRouter);
app.use('/api/projects', apiBindingsRouter);
app.use('/api/projects', componentDependenciesRouter);
app.use('/api/projects', elementConstraintsRouter);
app.use('/api/projects', exportRouter);
app.use('/api/projects', patchesRouter);
app.use('/api/users', usersRouter);
app.use('/api/users', preferencesRouter);
app.use('/api/projects', forkRouter);
app.use('/api/projects', pageMappingsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/prompt-templates', promptTemplatesRouter);
app.use('/api/queue', queueRouter);
app.use('/api/design-presets', designPresetsRouter);
app.use('/api/components', componentsRouter);
app.use('/api/projects', projectComponentsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Run migrations on startup
runMigrations();

// Seed design convention if empty
try {
  const conv = db.prepare("SELECT design_convention FROM global_design_profile WHERE id = 'global'").get() as any;
  if (!conv?.design_convention || conv.design_convention.length < 2000) {
    db.prepare("INSERT INTO global_design_profile (id, design_convention) VALUES ('global', ?) ON CONFLICT(id) DO UPDATE SET design_convention = excluded.design_convention")
      .run(HOUSEPRICE_DESIGN_SYSTEM_V2);
    console.log('[seed] Design system v2 seeded');
  }
} catch (e) {
  console.warn('[seed] Could not seed design system v2:', e);
}

// Sync skills from external directory (SKILLS_DIR env var)
if (process.env.SKILLS_DIR) {
  syncSkillsFromDirectory(process.env.SKILLS_DIR);
}

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Disable socket timeout for SSE / long-running AI generation
httpServer.timeout = 0;
httpServer.keepAliveTimeout = 120_000; // 2 min keep-alive
httpServer.headersTimeout = 125_000;

// Prevent unhandled errors from crashing the server (e.g. Tesseract CDN failure)
process.on('unhandledRejection', (reason: any) => {
  console.error('[server] Unhandled rejection (caught, not crashing):', reason?.message || reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[server] Uncaught exception (caught, not crashing):', err.message);
});

export default app;
