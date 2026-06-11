import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import * as providerModule from '../../services/provider';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

// Mock the AI provider — return a deterministic streamContent
beforeEach(async () => {
  vi.restoreAllMocks();
  dataDir = mkdtempSync(join(tmpdir(), 'ch-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => {
  vi.restoreAllMocks();
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const SELECTION = { provider: 'opencode', model: 'gemini-2.5-flash', credentialType: 'api', credentialRef: 'opencode-1' };

function mockProvider(stream: string[]) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamWithSelection: () => ({
      selection: SELECTION,
      stream: (async function* () { for (const t of stream) yield t; })(),
    }),
    generateWithSelection: vi.fn(),
  } as never);
}

/** Capturing variant: hands params to the callback, streams its return. */
function mockProviderCapture(fn: (params: { systemInstruction?: string }) => string) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamWithSelection: (params: { systemInstruction?: string }) => ({
      selection: SELECTION,
      stream: (async function* () { yield fn(params); })(),
    }),
    generateWithSelection: vi.fn(),
  } as never);
}

describe('POST /api/projects/:id/chat (M1 anonymous)', () => {
  it('streams events and persists a Turn', async () => {
    mockProvider(['hello ', 'world']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: phase');
    expect(r.text).toContain('event: token');
    expect(r.text).toContain('event: done');
    const turns = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(turns.body.turns).toHaveLength(1);
    expect(turns.body.turns[0].userText).toBe('hi');
  });

  it('routes <thinking> tokens to thinking_token events', async () => {
    mockProvider(['<thinking>let me think</thinking>', 'the answer']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: 'hi' });
    expect(r.text).toContain('event: thinking_token');
    expect(r.text).toContain('let me think');
    expect(r.text).toContain('the answer');
  });

  it('parses <facts> block and persists facts', async () => {
    mockProvider(['answer text\n<facts>[{"kind":"requirement","text":"r1"}]</facts>']);
    await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: 'hi' });
    const facts = await request(app).get(`/api/projects/${projectId}/facts`);
    expect(facts.body.facts).toHaveLength(1);
    expect(facts.body.facts[0].text).toBe('r1');
  });

  it('400 on bad mode', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'bogus', text: 'hi' });
    expect(r.status).toBe(400);
  });

  it('400 on empty text', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: '' });
    expect(r.status).toBe(400);
  });

  it('404 on missing project', async () => {
    const r = await request(app).post(`/api/projects/nope/chat`).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(404);
  });

  it('slash command forces a skill into prompt', async () => {
    // Provider captures what systemInstruction came in
    let captured = '';
    mockProviderCapture((params) => { captured = params.systemInstruction ?? ''; return 'ok'; });
    await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: '/consult-clarify-first hello' });
    expect(captured).toContain('Consult'); // matches built-in skill body
  });

  it('council mode runs four personas and emits council_token events', async () => {
    const callCount = { n: 0 };
    mockProviderCapture((params) => {
      callCount.n += 1;
      const which = params.systemInstruction?.match(/council-(pm|designer|engineer|moderator)/);
      return `[${which?.[1] ?? 'unknown'}] reply`;
    });

    const r = await request(app).post(`/api/projects/${projectId}/chat`)
      .send({ mode: 'consult', text: 'design a counter', council: true });

    expect(callCount.n).toBe(4);
    expect(r.text).toContain('council_pm');
    expect(r.text).toContain('council_designer');
    expect(r.text).toContain('council_engineer');
    expect(r.text).toContain('council_moderator');
    expect(r.text).toContain('event: council_token');
  });

  it('council=true on non-consult mode is ignored', async () => {
    mockProvider(['only-one-call']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`)
      .send({ mode: 'architect', text: 'hi', council: true });
    expect(r.text).not.toContain('council_token');
  });

  it('AI emitting artifact tag persists artifact + emits artifact SSE event + GET artifacts shows record', async () => {
    mockProvider([
      'Here is the page structure.\n',
      '<artifact kind="page-graph" name="ia">{"nodes":[{"id":"home","label":"首頁"}],"edges":[]}</artifact>',
    ]);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'architect', text: '設計頁面結構' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: artifact');
    // artifact block should NOT appear in turn answer text
    const turns = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(turns.body.turns[0].aiResponse.text).not.toContain('<artifact');
    // GET artifacts shows the persisted record
    const artifacts = await request(app).get(`/api/projects/${projectId}/artifacts?kind=page-graph`);
    expect(artifacts.body.artifacts).toHaveLength(1);
    expect(artifacts.body.artifacts[0].name).toBe('ia');
  });
});

describe('quick-reply choices + consult→design handoff', () => {
  it('moderator <choices> become SSE choices event and persist on the turn', async () => {
    mockProviderCapture((params) => {
      // 每個 persona 的 prompt 都含全部 council-* skill 名（Available skills 清單），
      // 必須用「你的身份」區塊辨識實際 persona。
      if (params.systemInstruction?.includes('主持人（Moderator）')) {
        return '結論文字 <choices>["首頁","搜尋結果頁"]</choices>';
      }
      return 'persona reply';
    });
    const r = await request(app).post(`/api/projects/${projectId}/chat`)
      .send({ mode: 'consult', text: '做個房屋網', council: true });
    expect(r.text).toContain('event: choices');
    expect(r.text).toContain('首頁');
    const turns = await request(app).get(`/api/projects/${projectId}/turns`);
    const last = turns.body.turns[turns.body.turns.length - 1];
    expect(last.aiResponse.choices).toEqual(['首頁', '搜尋結果頁']);
    expect(last.aiResponse.text).not.toContain('<choices>');
  });

  it('moderator <handoff>design</handoff> triggers design generation in the same stream', async () => {
    let calls = 0;
    mockProviderCapture((params) => {
      calls += 1;
      if (params.systemInstruction?.includes('主持人（Moderator）')) {
        return '接下來會做首頁 wireframe <handoff>design</handoff>';
      }
      if (params.systemInstruction?.includes('Vue 3 + Tailwind CSS UI designer')) {
        // the handed-off design generation call
        return '<artifact kind="vue-sfc" name="home"><template><div>自動生成</div></template></artifact>';
      }
      return 'persona reply';
    });
    const r = await request(app).post(`/api/projects/${projectId}/chat`)
      .send({ mode: 'consult', text: '我想要這個 wireframe', council: true });
    expect(calls).toBe(5); // 4 council personas + 1 design generation
    expect(r.text).toContain('event: mode_handoff');
    expect(r.text).toContain('event: artifact');
    const turns = await request(app).get(`/api/projects/${projectId}/turns`);
    const modes = turns.body.turns.map((t: { mode: string }) => t.mode);
    expect(modes).toContain('design');
    const consultTurn = turns.body.turns.find((t: { mode: string }) => t.mode === 'consult');
    expect(consultTurn.aiResponse.text).not.toContain('<handoff>');
  });
});
