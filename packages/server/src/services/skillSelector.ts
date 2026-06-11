/**
 * skillSelector — automatic domain-skill selection for design/consult
 * generation (domain-skill-selection spec).
 *
 * One lightweight JSON call picks 0–3 relevant skills from the registry; the
 * selected bodies are injected into the generation system prompt (8K chars
 * per skill, 20K total). Selector failure NEVER blocks generation.
 */
import { getProvider, defaultModel, withJsonInstruction, extractJsonBody } from './provider.js';
import { listSkills, readSkill } from './skillRegistry.js';

export interface SkillSelection {
  /** Names of skills whose bodies were injected. */
  selected: string[];
  /** Prompt block to append to systemInstruction ('' when none). */
  block: string;
}

const MAX_SKILLS = 3;
const PER_SKILL_CAP = 8_000;
const TOTAL_CAP = 20_000;

const SELECTOR_SYSTEM =
  'You route design/consulting requests to domain-knowledge skills. ' +
  'Given a user request and a skill index, pick the skills whose domain knowledge is REQUIRED ' +
  `to answer well. Pick at most ${MAX_SKILLS}; pick NONE when no skill is clearly relevant. ` +
  'Respond with JSON: {"skills": ["name", ...]} — names must come from the index verbatim.';

/** Council personas and other built-ins that must never be auto-injected. */
const EXCLUDED_PREFIXES = ['council-', 'frontend-design'];

export async function selectSkills(opts: { userText: string; projectId: string }): Promise<SkillSelection> {
  const candidates = listSkills({ projectId: opts.projectId })
    .filter(s => !EXCLUDED_PREFIXES.some(p => s.name.startsWith(p)));
  if (candidates.length === 0) return { selected: [], block: '' };

  const index = candidates.map(s => `- ${s.name}: ${s.description ?? ''}`).join('\n');

  let names: string[] = [];
  try {
    const exec = await getProvider().generateWithSelection({
      model: defaultModel(),
      systemInstruction: withJsonInstruction(SELECTOR_SYSTEM),
      prompt: `Skill index:\n${index}\n\nUser request:\n${opts.userText.slice(0, 2_000)}`,
      maxOutputTokens: 512,
    });
    const parsed = JSON.parse(extractJsonBody(exec.response.text)) as { skills?: unknown };
    if (Array.isArray(parsed.skills)) {
      names = parsed.skills.filter((n): n is string => typeof n === 'string');
    }
  } catch (e) {
    console.warn('[skillSelector] selection call failed, generating without domain skills:', (e as Error).message?.slice(0, 120));
    return { selected: [], block: '' };
  }

  const valid = names
    .filter(n => candidates.some(c => c.name === n))
    .slice(0, MAX_SKILLS);
  if (valid.length === 0) return { selected: [], block: '' };

  const sections: string[] = [];
  let total = 0;
  const selected: string[] = [];
  for (const name of valid) {
    const skill = readSkill(name, { projectId: opts.projectId });
    if (!skill?.body) continue;
    const body = skill.body.slice(0, PER_SKILL_CAP);
    if (total + body.length > TOTAL_CAP) break;
    total += body.length;
    selected.push(name);
    sections.push(`### Skill: ${name}\n${body}`);
  }
  if (selected.length === 0) return { selected: [], block: '' };

  return {
    selected,
    block: `## Domain knowledge（依需求自動選入，生成時必須遵循）\n\n${sections.join('\n\n')}`,
  };
}
