import { getProvider, defaultModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from './provider';

export interface SkillConflict {
  rule: string;
  skillName: string;
  userIntent: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion: string;
}

export interface ConflictReport {
  conflicts: SkillConflict[];
}

/**
 * Check for conflicts between user requirements and Skill business rules.
 * Called after planAndReview(), before generateParallel().
 *
 * Returns empty conflicts array if:
 * - No skills provided
 * - AI call fails (graceful degradation)
 */
export async function checkSkillConflicts(
  userMessage: string,
  planPages: string[],
  planConstraints: string[],
  skills: { name: string; description: string; content: string }[],
): Promise<ConflictReport> {
  if (skills.length === 0) {
    return { conflicts: [] };
  }

  const skillsText = skills
    .slice(0, 10)
    .map(s => `【${s.name}】${s.description || ''}\n${s.content.slice(0, 800)}`)
    .join('\n\n');

  const prompt = `你是一個業務規則衝突檢測器。比對使用者的需求與專案知識庫（Skill）的規則，找出矛盾或遺漏。

使用者需求：「${userMessage.slice(0, 500)}」

規劃的頁面：${planPages.join('、')}
${planConstraints.length > 0 ? `設計約束：${planConstraints.join('；')}` : ''}

專案知識庫（Skill 規則）：
${skillsText}

請比對使用者需求和 Skill 規則，找出：
1. 使用者需求直接違反 Skill 規則的地方（severity: critical）
2. 使用者需求可能與 Skill 規則不一致的地方（severity: warning）
3. 使用者可能遺漏但 Skill 要求的功能（severity: info）

回傳 JSON：
{
  "conflicts": [
    {
      "rule": "Skill 中的規則原文（簡短）",
      "skillName": "哪個 Skill",
      "userIntent": "使用者說了什麼（簡短）",
      "severity": "critical | warning | info",
      "suggestion": "建議怎麼處理（一句話）"
    }
  ]
}

如果沒有衝突，回傳 {"conflicts": []}。只回傳 JSON，不要其他文字。`;

  try {
    const client = getProvider();
    const exec = await Promise.race([
      client.generateWithSelection({
        model: defaultModel(),
        systemInstruction: withJsonInstruction(),
        prompt,
        maxOutputTokens: 2048,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000)),
    ]);

    const { selection, response } = exec;
    try { trackProviderUsage(selection, 'skill-conflict-check', response); } catch {}

    const parsed = JSON.parse(extractJsonBody(response.text)) as ConflictReport;

    if (!Array.isArray(parsed.conflicts)) {
      console.warn('[conflict-check] Invalid response structure, skipping');
      return { conflicts: [] };
    }

    parsed.conflicts = parsed.conflicts.filter(c =>
      c.rule && c.skillName && c.severity &&
      ['info', 'warning', 'critical'].includes(c.severity)
    );

    console.log(`[conflict-check] Found ${parsed.conflicts.length} conflicts (${parsed.conflicts.filter(c => c.severity === 'critical').length} critical)`);
    return parsed;
  } catch (err: any) {
    console.warn('[conflict-check] Failed, skipping:', err.message?.slice(0, 100));
    return { conflicts: [] };
  }
}
