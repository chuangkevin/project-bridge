import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { initSocketServer, emitToProject, _resetSocketServer } from '../socketServer';
import request from 'supertest';

let httpServer: ReturnType<typeof createServer>;
let dataDir: string;
let port: number;
let token: string;
let projectId: string;
let db: { close(): void } | null = null;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-'));
  const app = createApp({ dataDir });
  db = app.locals.db as { close(): void };
  httpServer = createServer(app);
  initSocketServer(httpServer, app.locals.db);
  await new Promise<void>((resolve) => { httpServer.listen(0, () => resolve()); });
  port = (httpServer.address() as { port: number }).port;
  const r = await request(`http://127.0.0.1:${port}`).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(`http://127.0.0.1:${port}`).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});

afterEach(async () => {
  _resetSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  db?.close();
  db = null;
  rmSync(dataDir, { recursive: true, force: true });
});

function connect(authToken?: string): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    auth: authToken ? { token: authToken } : {},
    reconnection: false,
  });
}

describe('socketServer', () => {
  it('rejects connect without auth', async () => {
    const s = connect();
    const err = await new Promise<Error>((resolve) => s.on('connect_error', resolve));
    expect(err.message).toBe('AUTH_REQUIRED');
    s.close();
  });

  it('connects with valid token and joins project', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    const joined = new Promise<{ projectId: string }>((resolve) => s.on('project:joined', resolve));
    s.emit('project:join', projectId);
    expect(await joined).toEqual({ projectId });
    s.close();
  });

  it('emitToProject delivers events to joined clients', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    await new Promise<void>((resolve) => { s.on('project:joined', () => resolve()); s.emit('project:join', projectId); });

    const received = new Promise<{ id: string }>((resolve) => s.on('turn:created', resolve));
    emitToProject(projectId, 'turn:created', { id: 't1' });
    expect(await received).toEqual({ id: 't1' });
    s.close();
  });

  it('rejects project:join for non-owned project', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    const err = new Promise<{ code: string }>((resolve) => s.on('project:error', resolve));
    s.emit('project:join', 'not-mine');
    expect(await err).toEqual({ code: 'NOT_FOUND' });
    s.close();
  });
});
