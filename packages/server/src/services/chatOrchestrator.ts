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

export interface ExtractedArtifact {
  kind: 'vue-sfc' | 'page-graph' | 'design-tokens';
  name: string;
  payload: string;
}

const ARTIFACT_RE = /<artifact\s+kind="(vue-sfc|page-graph|design-tokens)"(?:\s+name="([^"]+)")?>([\s\S]*?)<\/artifact>/gi;

export function parseArtifactsFromResponse(fullText: string): ExtractedArtifact[] {
  const out: ExtractedArtifact[] = [];
  let m;
  // Reset lastIndex since ARTIFACT_RE is module-level with /g flag
  ARTIFACT_RE.lastIndex = 0;
  while ((m = ARTIFACT_RE.exec(fullText)) !== null) {
    out.push({
      kind: m[1] as ExtractedArtifact['kind'],
      name: (m[2] ?? 'untitled').trim(),
      payload: m[3].trim(),
    });
  }
  return out;
}

/** Fallback: if no `<artifact>` tags found, extract ```vue or ```html code blocks
 *  and auto-wrap them as vue-sfc artifacts so design mode preview never stays empty. */
export function parseArtifactsFromResponseWithFallback(fullText: string): ExtractedArtifact[] {
  const found = parseArtifactsFromResponse(fullText);
  if (found.length > 0) return found;

  // Fallback: extract ```vue or ```html code blocks as vue-sfc artifacts
  const codeBlockRe = /```(?:vue|html)\n([\s\S]*?)```/gi;
  const fallbacks: ExtractedArtifact[] = [];
  let m;
  let i = 1;
  while ((m = codeBlockRe.exec(fullText)) !== null) {
    fallbacks.push({
      kind: 'vue-sfc',
      name: `page-${i++}`,
      payload: m[1].trim(),
    });
  }
  return fallbacks;
}
