import { callProvider } from './callProvider.js';
import { readSkill } from './skillRegistry.js';

export type CouncilPersona = 'pm' | 'designer' | 'engineer' | 'moderator';

export interface CouncilStepEvent {
  kind: 'persona_start' | 'persona_token' | 'persona_end';
  persona: CouncilPersona;
  text?: string;
}

export interface RunCouncilOpts {
  baseSystemPrompt: string;        // already-assembled (mode + memory + skills) prompt
  userText: string;
  mode: 'consult' | 'architect' | 'design';
  projectId: string;
}

const PERSONAS: { persona: CouncilPersona; skillName: string }[] = [
  { persona: 'pm', skillName: 'council-pm' },
  { persona: 'designer', skillName: 'council-designer' },
  { persona: 'engineer', skillName: 'council-engineer' },
  { persona: 'moderator', skillName: 'council-moderator' },
];

/**
 * Runs the four personas sequentially, yielding step events.
 * Each non-moderator persona's output is appended to the running transcript that the
 * next persona sees. Moderator gets the full transcript + the request to synthesize.
 *
 * Returns: { transcripts: Record<CouncilPersona, string>, finalAnswer: string }
 * via the generator's return value.
 */
export async function* runCouncil(opts: RunCouncilOpts): AsyncGenerator<CouncilStepEvent, { transcripts: Record<CouncilPersona, string>; finalAnswer: string }, void> {
  const transcripts: Record<CouncilPersona, string> = { pm: '', designer: '', engineer: '', moderator: '' };

  for (const p of PERSONAS) {
    const personaSkill = readSkill(p.skillName, { projectId: opts.projectId });
    if (!personaSkill) throw new Error(`council persona skill missing: ${p.skillName}`);

    // Compose system prompt: base + persona overlay + prior transcripts
    let priorContext = '';
    for (const earlier of PERSONAS) {
      if (earlier.persona === p.persona) break;
      if (transcripts[earlier.persona]) {
        priorContext += `\n\n## 前面 ${earlier.persona.toUpperCase()} 已經說：\n${transcripts[earlier.persona]}`;
      }
    }
    const personaPrompt = `${opts.baseSystemPrompt}\n\n## 你的身份\n${personaSkill.body}${priorContext}`;

    yield { kind: 'persona_start', persona: p.persona };

    let buffer = '';
    for await (const tok of callProvider({
      mode: opts.mode,
      prompt: opts.userText,
      systemInstruction: personaPrompt,
      streaming: true,
    })) {
      buffer += tok;
      yield { kind: 'persona_token', persona: p.persona, text: tok };
    }
    transcripts[p.persona] = buffer;
    yield { kind: 'persona_end', persona: p.persona };
  }

  return { transcripts, finalAnswer: transcripts.moderator };
}
