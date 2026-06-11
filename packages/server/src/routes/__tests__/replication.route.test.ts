import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';
import * as providerModule from '../../services/provider';

// No real crawling in tests
vi.mock('../../services/replication.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/replication.js')>();
  return {
    ...actual,
    crawlForReplication: vi.fn(async (url: string) => ({
      url, html: '<html><body><div class="hero">爬到的內容</div></body></html>', styleSummary: '{"colors":["#112233"]}',
    })),
  };
});

const SELECTION = { provider: 'opencode', model: 'gpt-5.5', credentialType: 'api', credentialRef: 'opencode-1' };

function mockProvider(opts: { streamText?: string; genText?: string; genThrows?: boolean }) {
  const captured: Array<{ systemInstruction?: string; prompt?: string; images?: unknown[] }> = [];
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamWithSelection: (params: { systemInstruction?: string; prompt?: string }) => {
      captured.push(params);
      return { selection: SELECTION, stream: (async function* () { yield opts.streamText ?? ''; })() };
    },
    generateWithSelection: async (params: { systemInstruction?: string; prompt?: string; images?: unknown[] }) => {
      captured.push(params);
      if (opts.genThrows) throw new Error('image parts rejected');
      return { selection: SELECTION, response: { text: opts.genText ?? '' } };
    },
  } as never);
  return captured;
}

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  dataDir = mkdtempSync(join(tmpdir(), 'repl-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'R' });
  projectId = p.body.id;
});
afterEach(() => {
  vi.restoreAllMocks();
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const ART = `<artifact kind="vue-sfc" name="cloned"><template><div class="hero">複製品</div></template><script>export default {}</script></artifact>`;

describe('design chat — replication intake', () => {
  it('URL + intent=replicate runs replicate mode with crawled source in prompt', async () => {
    const captured = mockProvider({ streamText: ART });
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({
      mode: 'design', text: '照抄 https://example.com/page',
      replicationIntent: { intent: 'replicate', destination: 'new' },
    });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: artifact');
    const call = captured[captured.length - 1];
    expect(call.systemInstruction).toContain('pixel-faithful UI replicator');
    expect(call.systemInstruction).not.toContain('art director'); // no frontend-design skill push
    expect(call.prompt).toContain('爬到的內容');
    expect(call.prompt).toContain('照抄來源');
  });

  it('media without intent → confirm-first instruction appended, normal design flow', async () => {
    const captured = mockProvider({ streamText: ART });
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({
      mode: 'design', text: '看看這個 https://example.com/page',
    });
    expect(r.status).toBe(200);
    const call = captured[captured.length - 1];
    expect(call.systemInstruction).toContain('尚未表明是否要照抄');
    expect(call.systemInstruction).toContain('Vue 3 + Tailwind CSS UI designer'); // still design mode
  });

  it('style-only intent appends style-only instruction and stays in design mode', async () => {
    const captured = mockProvider({ streamText: ART });
    await request(app).post(`/api/projects/${projectId}/chat`).send({
      mode: 'design', text: '參考 https://example.com 的風格做一頁',
      replicationIntent: { intent: 'style-only' },
    });
    const call = captured[captured.length - 1];
    expect(call.systemInstruction).toContain('僅供擷取整體風格');
    expect(call.systemInstruction).toContain('Vue 3 + Tailwind CSS UI designer');
  });

  it('replicate into selected element inserts snippet into active artifact', async () => {
    // Seed an active artifact
    const turn = appendTurn(app.locals.db, { projectId, mode: 'design', userText: 's', aiResponse: { text: '' } });
    const seeded = createArtifact(app.locals.db, {
      projectId, createdByTurn: turn.id, kind: 'vue-sfc', name: 'page',
      payload: '<template>\n<div class="root">\n<section class="target">既有內容</section>\n</div>\n</template>',
      payloadExt: 'vue', artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
    });
    const captured = mockProvider({ streamText: '```html\n<div class="cloned-card">照抄的卡片</div>\n```' });

    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({
      mode: 'design', text: '把這張卡照抄進來 https://example.com/card',
      activeArtifactId: seeded.id,
      replicationIntent: { intent: 'replicate', destination: 'element', elementPath: [0, 0] },
    });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: artifact');
    expect(captured[captured.length - 1].systemInstruction).toContain('OUTPUT FORMAT OVERRIDE');

    // New artifact contains the inserted snippet INSIDE the target section
    const artifactsList = await request(app).get(`/api/projects/${projectId}/artifacts`);
    const newest = artifactsList.body.artifacts.find((a: { supersededBy: string | null; kind: string }) => !a.supersededBy && a.kind === 'vue-sfc');
    const row = app.locals.db.prepare('SELECT payload_path FROM artifacts WHERE id = ?').get(newest.id) as { payload_path: string };
    const payload = readFileSync(join(dataDir, row.payload_path), 'utf8');
    expect(payload).toContain('既有內容');
    expect(payload).toContain('照抄的卡片');
    expect(payload.indexOf('照抄的卡片')).toBeGreaterThan(payload.indexOf('既有內容'));
    expect(payload.indexOf('照抄的卡片')).toBeLessThan(payload.indexOf('</section>') + 20);
  });
});

describe('council handoff with URL → crawled replicate generation', () => {
  it('handoff design generation uses replicate mode with crawled source', async () => {
    const captured: Array<{ systemInstruction?: string; prompt?: string }> = [];
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamWithSelection: (params: { systemInstruction?: string; prompt?: string }) => {
        captured.push(params);
        let text = 'persona reply';
        if (params.systemInstruction?.includes('主持人（Moderator）')) {
          text = '接下來會做該站首頁 wireframe <handoff>design</handoff>';
        } else if (params.systemInstruction?.includes('pixel-faithful UI replicator')) {
          text = '<artifact kind="vue-sfc" name="cloned-home"><template><div>忠實重建</div></template></artifact>';
        }
        return { selection: SELECTION, stream: (async function* () { yield text; })() };
      },
      generateWithSelection: vi.fn(async () => ({ selection: SELECTION, response: { text: '' } })),
    } as never);

    const r = await request(app).post(`/api/projects/${projectId}/chat`)
      .send({ mode: 'consult', text: '我想要這個 https://buy.houseprice.tw/', council: true });

    expect(r.status).toBe(200);
    expect(r.text).toContain('event: mode_handoff');
    expect(r.text).toContain('event: artifact');
    const gen = captured.find(c => c.systemInstruction?.includes('pixel-faithful UI replicator'));
    expect(gen).toBeTruthy();
    expect(gen!.prompt).toContain('爬到的內容'); // crawled source rode the prompt
    expect(gen!.prompt).toContain('照抄來源');
  });
});
