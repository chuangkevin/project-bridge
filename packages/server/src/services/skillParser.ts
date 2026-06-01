import matter from 'gray-matter';

export interface SkillFrontmatter {
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Skill extends SkillFrontmatter {
  body: string;
}

export type ParseResult = { ok: true; skill: Skill } | { ok: false; reason: string };

export function parseSkill(markdown: string): ParseResult {
  try {
    const parsed = matter(markdown);
    if (Object.keys(parsed.data).length === 0) return { ok: false, reason: 'no frontmatter' };
    const fm = parsed.data as Record<string, unknown>;
    const name = typeof fm.name === 'string' ? fm.name.trim() : '';
    const description = typeof fm.description === 'string' ? fm.description.trim() : '';
    if (!name) return { ok: false, reason: 'name required' };
    if (!description) return { ok: false, reason: 'description required' };
    const metadata = fm.metadata && typeof fm.metadata === 'object'
      ? (fm.metadata as Record<string, unknown>)
      : undefined;
    return {
      ok: true,
      skill: { name, description, metadata, body: parsed.content.trim() },
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
