import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
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
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/projects', forkRouter);
app.use('/api/projects', pageMappingsRouter);

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

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
