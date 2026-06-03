import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cpModule from '../callProvider';
import * as skillModule from '../skillRegistry';

vi.mock('../callProvider', () => ({ callProvider: vi.fn() }));
vi.mock('../skillRegistry', () => ({ readSkill: vi.fn() }));

import { runCouncil } from '../councilOrchestrator';

const PERSONA_NAMES = ['pm', 'designer', 'engineer', 'moderator'] as const;

function makeSkillMock() {
  (skillModule.readSkill as ReturnType<typeof vi.fn>).mockImplementation((name: string) => ({
    name, body: `body of ${name}`, description: `desc`, layer: 'builtin', source: `/${name}.md`,
  }));
}

function makeProviderMock(replyFn?: (si: string) => string) {
  (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
    (params: { systemInstruction?: string }) => {
      const reply = replyFn ? replyFn(params.systemInstruction ?? '') : 'mock reply';
      return (async function* () { yield reply; })();
    }
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('runCouncil', () => {
  it('all 4 personas produce events (panel in parallel, moderator last)', async () => {
    makeSkillMock();
    makeProviderMock((si) => {
      const m = si.match(/body of council-(pm|designer|engineer|moderator)/);
      return `reply-${m?.[1] ?? 'x'}`;
    });

    const events: Array<{ kind: string; persona: string }> = [];
    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'test', mode: 'consult', projectId: 'p' });
    while (true) {
      const step = await gen.next();
      if (step.done) break;
      events.push({ kind: step.value.kind, persona: step.value.persona });
    }

    // All 4 personas must emit start/token/end
    for (const persona of PERSONA_NAMES) {
      expect(events.some(e => e.kind === 'persona_start' && e.persona === persona)).toBe(true);
      expect(events.some(e => e.kind === 'persona_end' && e.persona === persona)).toBe(true);
    }
    // Moderator must come after all panel personas end
    const modStartIdx = events.findIndex(e => e.kind === 'persona_start' && e.persona === 'moderator');
    const panelEndIdx = Math.max(
      events.findLastIndex(e => e.kind === 'persona_end' && e.persona === 'pm'),
      events.findLastIndex(e => e.kind === 'persona_end' && e.persona === 'designer'),
      events.findLastIndex(e => e.kind === 'persona_end' && e.persona === 'engineer'),
    );
    expect(modStartIdx).toBeGreaterThan(panelEndIdx);
  });

  it('yields persona_start / persona_token / persona_end for each persona', async () => {
    makeSkillMock();
    makeProviderMock();

    const events: Array<{ kind: string; persona: string }> = [];
    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'hello', mode: 'consult', projectId: 'p' });
    while (true) {
      const step = await gen.next();
      if (step.done) break;
      events.push({ kind: step.value.kind, persona: step.value.persona });
    }

    for (const persona of PERSONA_NAMES) {
      expect(events).toContainEqual({ kind: 'persona_start', persona });
      expect(events).toContainEqual({ kind: 'persona_token', persona });
      expect(events).toContainEqual({ kind: 'persona_end', persona });
    }
  });

  it('panel personas do NOT see each other (parallel); Moderator sees all three', async () => {
    makeSkillMock();

    const captured: Array<{ si: string }> = [];
    (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (params: { systemInstruction?: string }) => {
        captured.push({ si: params.systemInstruction ?? '' });
        const m = params.systemInstruction?.match(/body of council-(pm|designer|engineer|moderator)/);
        return (async function* () { yield `out-${m?.[1] ?? 'x'}`; })();
      }
    );

    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    while (!(await gen.next()).done) { /* drain */ }

    // 4 calls total (pm, designer, engineer, moderator)
    expect(captured).toHaveLength(4);

    // Panel personas don't see each other
    const pmSi = captured.find(c => c.si.includes('body of council-pm'))!.si;
    const desSi = captured.find(c => c.si.includes('body of council-designer'))!.si;
    const engSi = captured.find(c => c.si.includes('body of council-engineer'))!.si;
    expect(pmSi).not.toContain('body of council-designer');
    expect(desSi).not.toContain('body of council-pm');
    expect(engSi).not.toContain('body of council-pm');

    // Moderator sees all three panel outputs
    const modSi = captured.find(c => c.si.includes('body of council-moderator'))!.si;
    expect(modSi).toContain('PM');
    expect(modSi).toContain('DESIGNER');
    expect(modSi).toContain('ENGINEER');
  });

  it('generator return value has finalAnswer === transcripts.moderator', async () => {
    makeSkillMock();
    makeProviderMock((si) => {
      const m = si.match(/body of council-(pm|designer|engineer|moderator)/);
      return `answer-from-${m?.[1] ?? 'x'}`;
    });

    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    let ret: { transcripts: Record<string, string>; finalAnswer: string } | undefined;
    while (true) {
      const step = await gen.next();
      if (step.done) { ret = step.value; break; }
    }

    expect(ret!.finalAnswer).toBe(ret!.transcripts.moderator);
    expect(ret!.transcripts.pm).toBe('answer-from-pm');
  });

  it('throws when a panel skill is missing', async () => {
    (skillModule.readSkill as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    await expect(gen.next()).rejects.toThrow('council skill missing');
  });
});
