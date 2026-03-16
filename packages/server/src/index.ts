import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/migrate';
import projectsRouter from './routes/projects';
import chatRouter from './routes/chat';
import shareRouter from './routes/share';
import settingsRouter from './routes/settings';
import uploadRouter from './routes/upload';
import annotationsRouter from './routes/annotations';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', chatRouter);
app.use('/api/share', shareRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/projects', uploadRouter);
app.use('/api/projects', annotationsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Run migrations on startup
runMigrations();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
