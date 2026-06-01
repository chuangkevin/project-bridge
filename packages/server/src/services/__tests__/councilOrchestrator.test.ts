import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cpModule from '../callProvider';
import * as skillModule from '../skillRegistry';

// Mock callProvider so tests don't need a real provider
vi.mock('../callProvider', () => ({
  callProvider: vi.fn(),
}));

// Mock skillRegistry so tests don't need a real DB / disk
vi.mock('../skillRegistry', () => ({
  readSkill: vi.fn(),
}));

// Import subject AFTER mocks are set up
import { runCouncil } from '../councilOrchestrator';

const PERSONA_NAMES = ['pm', 'designer', 'engineer', 'moderator'] as const;

function makeSkillMock() {
  (skillModule.readSkill as ReturnType<typeof vi.fn>).mockImplementation((name: string) => ({
    name,
    body: `body of ${name}`,
    description: `desc of ${name}`,
    layer: 'builtin',
    source: `/builtin/${name}.md`,
  }));
}

function makeProviderMock(replyFn?: (systemInstruction: string) => string) {
  (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
    (params: { systemInstruction?: string }) => {
      const reply = replyFn ? replyFn(params.systemInstruction ?? '') : 'mock reply';
      return (async function* () { yield reply; })();
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runCouncil', () => {
  it('executes all 4 personas in order: pm → designer → engineer → moderator', async () => {
    makeSkillMock();
    const order: string[] = [];
    (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (params: { systemInstruction?: string }) => {
        // detect which persona is being called by system prompt (skill names are council-pm, etc.)
        const m = params.systemInstruction?.match(/body of council-(pm|designer|engineer|moderator)/);
        if (m) order.push(m[1]);
        return (async function* () { yield `reply-${m?.[1] ?? 'unknown'}`; })();
      }
    );

    const events: Array<{ kind: string; persona: string }> = [];
    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'test', mode: 'consult', projectId: 'proj1' });
    while (true) {
      const step = await gen.next();
      if (step.done) break;
      events.push({ kind: step.value.kind, persona: step.value.persona });
    }

    expect(order).toEqual(['pm', 'designer', 'engineer', 'moderator']);
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

  it('each persona system prompt receives the prior personas transcripts', async () => {
    makeSkillMock();

    const captured: Array<{ systemInstruction: string }> = [];
    (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (params: { systemInstruction?: string }) => {
        captured.push({ systemInstruction: params.systemInstruction ?? '' });
        const m = params.systemInstruction?.match(/body of council-(pm|designer|engineer|moderator)/);
        return (async function* () { yield `mock-${m?.[1] ?? 'x'}`; })();
      }
    );

    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    while (true) {
      const step = await gen.next();
      if (step.done) break;
    }

    // PM sees no prior context (first persona)
    expect(captured[0].systemInstruction).not.toContain('前面');

    // Designer sees PM's output
    expect(captured[1].systemInstruction).toContain('前面 PM 已經說');
    expect(captured[1].systemInstruction).toContain('mock-pm');

    // Engineer sees PM + Designer
    expect(captured[2].systemInstruction).toContain('前面 PM 已經說');
    expect(captured[2].systemInstruction).toContain('前面 DESIGNER 已經說');
    expect(captured[2].systemInstruction).toContain('mock-pm');
    expect(captured[2].systemInstruction).toContain('mock-designer');

    // Moderator sees PM + Designer + Engineer
    expect(captured[3].systemInstruction).toContain('前面 PM 已經說');
    expect(captured[3].systemInstruction).toContain('前面 DESIGNER 已經說');
    expect(captured[3].systemInstruction).toContain('前面 ENGINEER 已經說');
    expect(captured[3].systemInstruction).toContain('mock-engineer');
  });

  it('generator return value has finalAnswer === transcripts.moderator', async () => {
    makeSkillMock();
    (cpModule.callProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (params: { systemInstruction?: string }) => {
        const m = params.systemInstruction?.match(/body of council-(pm|designer|engineer|moderator)/);
        const persona = m?.[1] ?? 'x';
        return (async function* () { yield `answer-from-${persona}`; })();
      }
    );

    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    let returnVal: { transcripts: Record<string, string>; finalAnswer: string } | undefined;
    while (true) {
      const step = await gen.next();
      if (step.done) {
        returnVal = step.value;
        break;
      }
    }

    expect(returnVal).toBeDefined();
    expect(returnVal!.finalAnswer).toBe(returnVal!.transcripts.moderator);
    expect(returnVal!.finalAnswer).toBe('answer-from-moderator');
    expect(returnVal!.transcripts.pm).toBe('answer-from-pm');
    expect(returnVal!.transcripts.designer).toBe('answer-from-designer');
    expect(returnVal!.transcripts.engineer).toBe('answer-from-engineer');
  });

  it('throws when a persona skill is missing', async () => {
    // readSkill returns null for all
    (skillModule.readSkill as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const gen = runCouncil({ baseSystemPrompt: 'base', userText: 'q', mode: 'consult', projectId: 'p' });
    await expect(gen.next()).rejects.toThrow('council persona skill missing: council-pm');
  });
});
