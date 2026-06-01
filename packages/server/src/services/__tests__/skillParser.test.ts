import { describe, it, expect } from 'vitest';
import { parseSkill } from '../skillParser';

describe('parseSkill', () => {
  it('parses name + description + body', () => {
    const md = `---
name: hpsk:price-doc
description: HousePrice 實價登錄 domain
---

# 實價登錄

body content`;
    const r = parseSkill(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.name).toBe('hpsk:price-doc');
    expect(r.skill.description).toBe('HousePrice 實價登錄 domain');
    expect(r.skill.body).toContain('# 實價登錄');
  });

  it('parses metadata as a record', () => {
    const md = `---
name: a
description: b
metadata:
  type: domain-knowledge
  source: HPSkills
---
body`;
    const r = parseSkill(md);
    if (!r.ok) throw new Error('parse failed');
    expect(r.skill.metadata).toEqual({ type: 'domain-knowledge', source: 'HPSkills' });
  });

  it('returns ok:false when name missing', () => {
    const md = `---
description: x
---
body`;
    expect(parseSkill(md).ok).toBe(false);
  });

  it('returns ok:false when description missing', () => {
    const md = `---
name: x
---
body`;
    expect(parseSkill(md).ok).toBe(false);
  });

  it('returns ok:false when no frontmatter', () => {
    expect(parseSkill('just plain markdown').ok).toBe(false);
  });

  it('strips trailing whitespace from body', () => {
    const md = `---
name: a
description: b
---
hi   `;
    const r = parseSkill(md);
    if (!r.ok) throw new Error('parse failed');
    expect(r.skill.body.endsWith('hi')).toBe(true);
  });
});
