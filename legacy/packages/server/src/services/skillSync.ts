import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

interface SkillFrontmatter {
  name: string;
  description: string;
}

function parseFrontmatter(content: string): { meta: SkillFrontmatter | null; body: string } {
  // Handle both LF and CRLF line endings
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: content };

  const raw = match[1];
  const body = match[2].trim();
  const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim() || '';
  const description = raw.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';

  if (!name) return { meta: null, body: content };
  return { meta: { name, description }, body };
}

function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(fullPath));
    } else if (entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Sync skills from external directory into agent_skills table.
 * Uses skill name as the unique key — inserts new, updates existing.
 * Skills from filesystem are marked with source = 'file'.
 */
export function syncSkillsFromDirectory(skillsDir: string): void {
  if (!skillsDir || !fs.existsSync(skillsDir)) {
    console.log(`[skillSync] SKILLS_DIR not set or not found: ${skillsDir || '(empty)'}`);
    return;
  }

  console.log(`[skillSync] Scanning skills from: ${skillsDir}`);
  const files = findSkillFiles(skillsDir);
  console.log(`[skillSync] Found ${files.length} SKILL.md files`);

  let inserted = 0;
  let updated = 0;

  const upsert = db.prepare(`
    INSERT INTO agent_skills (id, name, description, content, enabled, scope, project_id, created_by, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 'global', NULL, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      content = excluded.content,
      updated_at = excluded.updated_at
  `);

  const findByName = db.prepare('SELECT id FROM agent_skills WHERE name = ?');
  const updateByName = db.prepare('UPDATE agent_skills SET description = ?, content = ?, updated_at = ? WHERE name = ?');

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      if (!meta || !body) continue;

      const existing = findByName.get(meta.name) as { id: string } | undefined;
      const now = new Date().toISOString();

      if (existing) {
        updateByName.run(meta.description, body, now, meta.name);
        updated++;
      } else {
        const id = uuidv4();
        const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM agent_skills').get() as { m: number | null };
        upsert.run(id, meta.name, meta.description, body, (maxOrder.m ?? -1) + 1, now, now);
        inserted++;
      }
    } catch (err) {
      console.error(`[skillSync] Error processing ${filePath}:`, err);
    }
  }

  console.log(`[skillSync] Done: ${inserted} inserted, ${updated} updated`);
}
