import type { MemorySnapshot } from './memorySnapshot.js';
import type { TurnMode } from './turnService.js';

export interface BuildPromptOpts {
  mode: TurnMode;
  memorySnapshot: MemorySnapshot;
  skillDescriptions: string;         // pre-formatted "Available skills:\n- name: desc\n…"
  forcedSkillBody?: string;          // from slash command
  attachments?: Array<{ kind: string; parsedText?: string; originalName: string }>;
}

const FACTS_CLOSING =
  'If you produce structured facts, append a `<facts>...</facts>` JSON block at the end of your answer with `[{kind, text}, ...]`.';

export function buildSystemPrompt(opts: BuildPromptOpts): string {
  const { memorySnapshot: snapshot, skillDescriptions, forcedSkillBody, attachments } = opts;
  const sections: string[] = [];

  // 1. Facts
  if (snapshot.facts.length > 0) {
    const lines = snapshot.facts.map(f => `- [${f.kind}] ${f.text}`).join('\n');
    sections.push(`## Facts known about this project\n${lines}`);
  }

  // 2. Recent conversation
  if (snapshot.turns.length > 0) {
    const lines = snapshot.turns
      .map(t => `[${t.mode}] User: ${t.userText} | AI: ${t.aiResponse.text}`)
      .join('\n');
    sections.push(`## Recent conversation\n${lines}`);
  }

  // 3. Earlier turn notice
  if (snapshot.earlierTurnCount > 0) {
    sections.push(`## Earlier conversation\n(${snapshot.earlierTurnCount} earlier turns omitted for brevity.)`);
  }

  // 4. Active artifact
  if (snapshot.activeArtifactId) {
    sections.push(`## Active artifact: ${snapshot.activeArtifactId}`);
  }

  // 5. Available skills
  if (skillDescriptions) {
    sections.push(`## Available skills\n${skillDescriptions}`);
  }

  // 6. Forced skill body
  if (forcedSkillBody) {
    sections.push(`## Forced skill body\n${forcedSkillBody}`);
  }

  // 7. Attachments
  if (attachments && attachments.length > 0) {
    const lines = attachments.map(a => {
      const excerpt = a.parsedText ? `\n${a.parsedText.slice(0, 2000)}` : '';
      return `- ${a.originalName} (${a.kind})${excerpt}`;
    });
    sections.push(`## Attachments\n${lines.join('\n')}`);
  }

  // 8. Closing instruction
  sections.push(FACTS_CLOSING);

  return sections.join('\n\n');
}
