import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import * as providerModule from '../../services/provider';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

// Mock the AI provider — return a deterministic streamContent
beforeEach(async () => {
  vi.restoreAllMocks();
  dataDir = mkdtempSync(join(tmpdir(), 'ch-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => {
  vi.restoreAllMocks();
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function mockProvider(stream: string[]) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamContent: async function* () { for (const t of stream) yield t; },
    generateContent: vi.fn(),
  } as never);
}

describe('POST /api/projects/:id/chat', () => {
  it('streams events and persists a Turn', async () => {
    mockProvider(['hello ', 'world']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: phase');
    expect(r.text).toContain('event: token');
    expect(r.text).toContain('event: done');
    const turns = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(turns.body.turns).toHaveLength(1);
    expect(turns.body.turns[0].userText).toBe('hi');
  });

  it('routes <thinking> tokens to thinking_token events', async () => {
    mockProvider(['<thinking>let me think</thinking>', 'the answer']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.text).toContain('event: thinking_token');
    expect(r.text).toContain('let me think');
    expect(r.text).toContain('the answer');
  });

  it('parses <facts> block and persists facts', async () => {
    mockProvider(['answer text\n<facts>[{"kind":"requirement","text":"r1"}]</facts>']);
    await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    const facts = await request(app).get(`/api/projects/${projectId}/facts`).set(auth());
    expect(facts.body.facts).toHaveLength(1);
    expect(facts.body.facts[0].text).toBe('r1');
  });

  it('400 on bad mode', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'bogus', text: 'hi' });
    expect(r.status).toBe(400);
  });

  it('400 on empty text', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: '' });
    expect(r.status).toBe(400);
  });

  it('404 on missing project', async () => {
    const r = await request(app).post(`/api/projects/nope/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(404);
  });

  it('401 without auth', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(401);
  });

  it('slash command forces a skill into prompt', async () => {
    // Provider captures what systemInstruction came in
    let captured = '';
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: async function* (params: { systemInstruction?: string }) {
        captured = params.systemInstruction ?? '';
        yield 'ok';
      },
      generateContent: vi.fn(),
    } as never);
    await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: '/consult-clarify-first hello' });
    expect(captured).toContain('Consult'); // matches built-in skill body
  });
});
