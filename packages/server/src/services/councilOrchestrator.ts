import { callProvider } from './callProvider.js';
import { readSkill } from './skillRegistry.js';

export type CouncilPersona = 'pm' | 'designer' | 'engineer' | 'moderator';

export interface CouncilStepEvent {
  kind: 'persona_start' | 'persona_token' | 'persona_end';
  persona: CouncilPersona;
  text?: string;
}

export interface RunCouncilOpts {
  baseSystemPrompt: string;
  userText: string;
  mode: 'consult' | 'architect' | 'design';
  projectId: string;
}

const PANEL: { persona: CouncilPersona; skillName: string }[] = [
  { persona: 'pm', skillName: 'council-pm' },
  { persona: 'designer', skillName: 'council-designer' },
  { persona: 'engineer', skillName: 'council-engineer' },
];

/** Strip <thinking>...</thinking> blocks from a string */
function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

/**
 * Runs PM / Designer / Engineer in PARALLEL (Round 1).
 * Then Moderator synthesizes from all three (sequential, sees full context).
 *
 * Yields step events as personas stream.
 * Returns { transcripts, finalAnswer }.
 */
export async function* runCouncil(
  opts: RunCouncilOpts,
): AsyncGenerator<CouncilStepEvent, { transcripts: Record<CouncilPersona, string>; finalAnswer: string }, void> {
  const transcripts: Record<CouncilPersona, string> = { pm: '', designer: '', engineer: '', moderator: '' };

  // ── Round 1: parallel ─────────────────────────────────────────────────────
  // Collect all token events from PM/Designer/Engineer simultaneously.
  // We buffer each persona's tokens and interleave persona_start → tokens → persona_end
  // in the order they finish (first-to-finish emits first).

  const events: CouncilStepEvent[] = [];
  let panelError: Error | null = null;
  let done = 0;

  const panelPromises = PANEL.map(async ({ persona, skillName }) => {
    const skill = readSkill(skillName, { projectId: opts.projectId });
    if (!skill) throw new Error(`council skill missing: ${skillName}`);

    const prompt = `${opts.baseSystemPrompt}\n\n## 你的身份\n${skill.body}`;
    let buffer = '';

    events.push({ kind: 'persona_start', persona });

    for await (const tok of callProvider({
      mode: opts.mode,
      prompt: opts.userText,
      systemInstruction: prompt,
      streaming: true,
    })) {
      const clean = tok.replace(/<\/?thinking>/gi, '');
      if (clean) {
        buffer += clean;
        events.push({ kind: 'persona_token', persona, text: clean });
      } else {
        buffer += tok;
      }
    }

    transcripts[persona] = stripThinking(buffer);
    events.push({ kind: 'persona_end', persona });
    done++;
  });

  // Catch errors so the polling loop can exit
  const allDone = Promise.all(panelPromises).catch((err: Error) => {
    panelError = err;
    done = PANEL.length; // unblock the while loop
  });

  let emitted = 0;
  while (done < PANEL.length) {
    while (emitted < events.length) { yield events[emitted++]; }
    await new Promise<void>((res) => setImmediate(res));
  }
  await allDone;
  // Re-throw any panel error after draining buffered events
  if (panelError) throw panelError;
  while (emitted < events.length) { yield events[emitted++]; }

  // ── Round 2: Moderator synthesizes ────────────────────────────────────────
  const moderatorSkill = readSkill('council-moderator', { projectId: opts.projectId });
  if (!moderatorSkill) throw new Error('council skill missing: council-moderator');

  const priorContext = PANEL
    .map(({ persona }) => `## ${persona.toUpperCase()} 的意見：\n${transcripts[persona]}`)
    .join('\n\n');

  const moderatorPrompt = `${opts.baseSystemPrompt}\n\n## 你的身份\n${moderatorSkill.body}\n\n${priorContext}`;

  yield { kind: 'persona_start', persona: 'moderator' };
  let modBuffer = '';
  for await (const tok of callProvider({
    mode: opts.mode,
    prompt: opts.userText,
    systemInstruction: moderatorPrompt,
    streaming: true,
  })) {
    const clean = tok.replace(/<\/?thinking>/gi, '');
    if (clean) {
      modBuffer += clean;
      yield { kind: 'persona_token', persona: 'moderator', text: clean };
    } else {
      modBuffer += tok;
    }
  }
  transcripts.moderator = stripThinking(modBuffer);
  yield { kind: 'persona_end', persona: 'moderator' };

  return { transcripts, finalAnswer: transcripts.moderator };
}
