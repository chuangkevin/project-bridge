import { GoogleGenerativeAI } from '@google/generative-ai';
import { assignBatchKeys, getGeminiModel, markKeyBad, trackUsage } from './geminiKeys';

export interface GenerationPlan {
  pages: { name: string; description: string; keyFeatures: string[] }[];
  navigation: { from: string; to: string; trigger: string }[];
  constraints: string[];
  thinking: string;
}

// Agent team members
const AGENTS = {
  pm: { name: 'Echo', role: '產品經理', emoji: '👩‍💼' },
  ux: { name: 'Lisa', role: 'UX 設計師', emoji: '🎨' },
  qa: { name: 'David', role: 'QA 審查員', emoji: '🔍' },
  tech: { name: 'Bob', role: '技術主管', emoji: '👨‍💻' },
  // Sub-agents for page generation
  devs: ['James', 'Kevin', 'Mia', 'Alex', 'Sophie', 'Leo'],
};

export { AGENTS };

// Role-specific keywords for Layer 2 skill filtering
const ROLE_KEYWORDS: Record<string, string[]> = {
  pm: ['業務', '流程', '需求', '規則', '會員', '訂單', '權限', '刊登', '管理', 'business', 'flow', 'rule'],
  ux: ['設計', 'UI', 'UX', '介面', '美學', '排版', '色彩', '動效', 'design', 'layout', 'frontend', 'visual'],
  qa: ['規則', '驗證', '測試', '品質', '邊緣', '錯誤', '安全', 'rule', 'validate', 'test', 'edge'],
  tech: ['架構', '技術', '開發', '效能', 'API', '資料庫', '部署', 'architecture', 'tech', 'backend', 'performance'],
};

// Simple in-memory cache for role-filtered skills (same project + same skills = same result)
const skillFilterCache = new Map<string, { name: string; content: string }[]>();
let lastFilterCacheClear = Date.now();

function selectSkillsForRole(
  skills: { name: string; description: string; content: string }[],
  role: string,
): { name: string; content: string }[] {
  if (skills.length === 0) return [];

  // Clear stale cache every 5 minutes
  const now = Date.now();
  if (now - lastFilterCacheClear > 300000) {
    skillFilterCache.clear();
    lastFilterCacheClear = now;
  }

  const cacheKey = `${role}:${skills.map(s => s.name).sort().join(',')}`;
  const cached = skillFilterCache.get(cacheKey);
  if (cached) return cached;

  const keywords = ROLE_KEYWORDS[role] || [];
  const scored = skills.map(skill => {
    const text = (skill.name + ' ' + (skill.description || '')).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    return { skill, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const result = scored.slice(0, 3).map(s => ({
    name: s.skill.name,
    content: s.skill.content.slice(0, 400) + (s.skill.content.length > 400 ? '...' : ''),
  }));
  skillFilterCache.set(cacheKey, result);
  return result;
}

/**
 * Multi-AI Discussion Pipeline:
 * 1. Echo (PM) — 分析需求、定義功能、找盲點
 * 2. Lisa (UX) — 設計頁面、用戶流程、回應 Echo 的分析
 * 3. Bob (Tech Lead) — 整合意見、產出最終方案
 *
 * 對話式串流 — 使用者看到 agent 之間的討論。
 */
export async function planAndReview(
  userMessage: string,
  onThinking: (text: string) => void,
  skills: { name: string; description: string; content: string }[] = [],
  history: { role: string; content: string }[] = [],
  lessons: string[] = [],
): Promise<GenerationPlan> {
  const keys = assignBatchKeys(6);
  let keyIdx = 0;
  const getKey = () => keys[keyIdx++ % keys.length];

  async function callAIStream(prompt: string, agentName: string, maxTokens: number = 8000): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = getKey();
      try {
        const genai = new GoogleGenerativeAI(key);
        const model = genai.getGenerativeModel({
          model: getGeminiModel(),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
        });
        const result = await model.generateContentStream(prompt);
        let text = '';
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) {
            text += t;
            onThinking(t); // stream each chunk to client
          }
        }
        return text;
      } catch (e: any) {
        console.warn(`[${agentName}] Failed (attempt ${attempt + 1}):`, e.message?.slice(0, 50));
        markKeyBad(key);
      }
    }
    throw new Error(`${agentName} failed after 3 attempts`);
  }

  async function callAIJSON(prompt: string, agentName: string): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = getKey();
      try {
        const genai = new GoogleGenerativeAI(key);
        const model = genai.getGenerativeModel({
          model: getGeminiModel(),
          generationConfig: { maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json' },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        return JSON.parse(text);
      } catch (e: any) {
        console.warn(`[${agentName}] JSON failed (attempt ${attempt + 1}):`, e.message?.slice(0, 50));
        markKeyBad(key);
      }
    }
    throw new Error(`${agentName} JSON failed after 3 attempts`);
  }

  let fullDiscussion = '';

  // Build Layer 3 (historical lessons)
  const lessonsContext = lessons.length > 0
    ? `\n\n【上次生成教訓】\n${lessons.map(l => `• ${l}`).join('\n')}\n`
    : '';

  // Build per-agent context (replaces flat skillsContext)
  function buildAgentContext(role: string): string {
    let ctx = '';
    // Layer 2: role-specific skills
    const roleSkills = selectSkillsForRole(skills, role);
    if (roleSkills.length > 0) {
      ctx += `\n\n【專案知識庫（與你角色相關）】\n${roleSkills.map(s => `【${s.name}】${s.content}`).join('\n\n')}\n`;
      ctx += `\n⚠️ 以上知識庫僅供參考。若與使用者需求矛盾，以使用者為準，並在【分析】中說明原因。`;
    }
    // Layer 3: lessons
    ctx += lessonsContext;
    return ctx;
  }

  const historyContext = history.length > 0
    ? `\n\n【先前對話】\n${history.slice(-5).map(h => `${h.role === 'user' ? '用戶' : '助手'}：${h.content.slice(0, 200)}`).join('\n')}\n`
    : '';

  const { pm, ux, tech } = AGENTS;

  // ── Echo (PM): 分析需求 ──
  onThinking(`${pm.emoji} **${pm.name}**（${pm.role}）：\n\n`);
  let pmText = '';
  try {
    pmText = await callAIStream(`你是 ${pm.name}，一位資深產品經理。你正在團隊會議上分析客戶需求。
${buildAgentContext('pm')}${historyContext}
客戶說：「${userMessage.slice(0, 800)}」

請用繁體中文，以 ${pm.name} 的口吻。使用以下結構回答：

【觀察】列出你從需求中看到的 3-5 個關鍵事實（不要猜測，只列明確提到的）
【分析】基於觀察，推理出：目標用戶是誰？核心需求是什麼？有哪些隱含需求沒說出來？
【建議】具體建議：
- 建議頁面（2-6 字命名，每頁一行說明核心功能）
- 2-3 個潛在風險

❌ 差的回答範例：「這是一個購物網站，需要首頁和列表頁。」（太表面，沒有分析）
✅ 好的回答範例：「【觀察】用戶提到寵物用品、線上購買、會員折扣。【分析】目標是養寵物的年輕族群，核心需求是快速找到商品+下單，隱含需求：寵物種類篩選、回購提醒。【建議】首頁（搜尋+分類+推薦）、商品列表（篩選+排序）、商品詳情（規格+評價+加購物車）、購物車、會員中心（訂單+收藏+折扣）」

精簡扼要，不超過 15 行。`, pm.name, 10000);

    fullDiscussion += `${pm.name}（${pm.role}）：\n${pmText}\n\n`;
  } catch {
    onThinking('（分析中斷，繼續...）\n');
  }

  // ── Lisa (UX): 回應 PM，設計頁面 ──
  onThinking(`\n\n---\n\n${ux.emoji} **${ux.name}**（${ux.role}）：\n\n`);
  let uxText = '';
  try {
    uxText = await callAIStream(`你是 ${ux.name}，UX 設計師。你在團隊會議上，剛聽完 ${pm.name}（產品經理）的分析。
${buildAgentContext('ux')}${historyContext}
客戶需求：「${userMessage.slice(0, 500)}」

${pm.name} 的分析：
${pmText.slice(0, 2000)}

請用繁體中文，以 ${ux.name} 的口吻。使用以下結構回答：

【觀察】列出 ${pm.name} 提到的頁面和功能要點
【分析】用戶流程怎麼走？哪些頁面是核心？哪些是輔助？
【建議】
- 每個頁面的核心元件（每頁 1 行：「頁面名：元件1、元件2、元件3」）
- 用戶流程（用 → 連接）
- 2-3 個 UX 注意事項

❌ 差的回答範例：「首頁需要有導航欄和內容區域。」（太籠統，沒有具體元件）
✅ 好的回答範例：「【觀察】${pm.name} 建議 5 個頁面，核心功能是搜尋和下單。【分析】核心頁面：首頁、商品列表、商品詳情；輔助頁面：購物車、會員中心。用戶 80% 時間在前三頁。【建議】首頁：搜尋欄、分類卡片、推薦輪播。商品列表：篩選側欄、商品網格、排序下拉。流程：首頁 → 商品列表 → 商品詳情 → 購物車 → 結帳完成」

最後一行：PAGES: 頁面1, 頁面2, 頁面3, ...

精簡扼要，不超過 15 行。`, ux.name, 10000);

    fullDiscussion += `${ux.name}（${ux.role}）：\n${uxText}\n\n`;
  } catch {
    onThinking('（設計中斷，繼續...）\n');
  }

  // ── David (QA): 審查方案，找盲點 ──
  const { qa } = AGENTS;
  onThinking(`\n\n---\n\n${qa.emoji} **${qa.name}**（${qa.role}）：\n\n`);
  let qaText = '';
  try {
    // Build explicit skill rules list for David to compare against
    const qaSkills = selectSkillsForRole(skills, 'qa');
    const skillRulesList = qaSkills.length > 0
      ? `\n\n⚠️ 以下是專案知識庫（Skill）的業務規則，你必須逐條比對方案是否違反：\n${qaSkills.map(s => `• 【${s.name}】${s.content.slice(0, 200)}`).join('\n')}\n`
      : '';

    qaText = await callAIStream(`你是 ${qa.name}，QA 審查員。你剛聽完 ${pm.name} 和 ${ux.name} 的討論。
${buildAgentContext('qa')}${historyContext}
客戶需求：「${userMessage.slice(0, 300)}」

${pm.name} 說：${pmText.slice(0, 800)}
${ux.name} 說：${uxText.slice(0, 800)}
${skillRulesList}
以 ${qa.name} 的口吻。使用以下結構回答：

【觀察】方案中提到了什麼（頁面、功能、流程）
【分析】有什麼漏洞？邊界情況？
【建議】
1. 漏掉的使用場景（2-3 個）
2. 哪個頁面描述太模糊？
3. 導航死角？
${skills.length > 0 ? `4. 業務規則衝突（如有 skill 規則）：比對上面的 Skill 規則，指出方案中違反或遺漏的規則（指明【Skill 名稱】和具體規則）` : ''}

❌ 差的回答範例：「方案看起來不錯，但可以加一些功能。」（沒有指出具體問題）
✅ 好的回答範例：「【觀察】方案有 5 頁，含搜尋、列表、詳情、購物車、會員中心。流程：首頁→列表→詳情→購物車。【分析】沒有考慮未登入用戶的購物車處理、搜尋無結果的空狀態、商品下架後詳情頁的處理。【建議】1. 漏掉：未登入加購物車、搜尋無結果、庫存不足。2. 會員中心描述太模糊，需明確子功能。3. 購物車無法返回商品詳情。」

精簡扼要，不超過 12 行。語氣：code review 風格，直接指出問題。`, qa.name, 10000);

    fullDiscussion += `${qa.name}（${qa.role}）：\n${qaText}\n\n`;
  } catch {
    onThinking('（審查中斷，繼續...）\n');
  }

  // ── Lisa (UX): 回應 David 的質疑 ──
  if (qaText && qaText.length > 50) {
    onThinking(`\n\n---\n\n${ux.emoji} **${ux.name}**（${ux.role}・回應質疑）：\n\n`);
    try {
      const lisaResponse = await callAIStream(`你是 ${ux.name}，UX 設計師。${qa.name}（QA）剛才對你的設計提出了質疑。
${buildAgentContext('ux')}
${qa.name} 的質疑：
${qaText.slice(0, 1500)}

請用繁體中文，以 ${ux.name} 的口吻，簡短回應（5 行以內）：
1. 同意哪些質疑？如何調整？
2. 不同意哪些？為什麼你的設計是對的？
3. 如果需要修改頁面清單，更新 PAGES 行

語氣：專業但有主見，不要全盤接受。`, ux.name, 6000);

      fullDiscussion += `${ux.name}（${ux.role}・回應質疑）：\n${lisaResponse}\n\n`;
    } catch {
      onThinking('（回應中斷，繼續...）\n');
    }
  }

  // ── Bob (Tech Lead): 最終整合 + 明確總結 ──
  onThinking(`\n\n---\n\n${tech.emoji} **${tech.name}**（${tech.role}）：\n\n`);
  let techText = '';
  try {
    techText = await callAIStream(`你是 ${tech.name}，技術主管。團隊討論完了，你要做最後總結。
${buildAgentContext('tech')}${historyContext}
客戶需求：「${userMessage.slice(0, 300)}」

${pm.name}（產品經理）：${pmText.slice(0, 1000)}
${ux.name}（UX 設計師）：${uxText.slice(0, 1000)}
${qa.name}（QA 審查員）：${qaText.slice(0, 1000)}

以 ${tech.name} 的口吻。使用以下結構回答：

【觀察】各人意見的共識和分歧
【分析】哪個方案最務實？需要取捨什麼？
【建議】
1. 回應 ${qa.name} 的問題
2. 最終頁面清單（「• 頁面名：3 個核心功能」格式）
3. 「開始製作，分配任務。」

❌ 差的回答範例：「大家說得都對，我們就照這個做吧。」（沒有整合分歧，沒有決策）
✅ 好的回答範例：「【觀察】${pm.name} 和 ${ux.name} 都同意 5 個核心頁面，${qa.name} 指出購物車和會員中心需要補強。【分析】核心流程（搜尋→瀏覽→下單）優先，會員中心可簡化為訂單+收藏。【建議】1. 未登入用戶：加購物車存 localStorage，結帳時要求登入。搜尋無結果：顯示推薦商品。2. • 首頁：搜尋、分類、推薦 • 商品列表：篩選、排序、分頁 • 商品詳情：規格、評價、加購物車 • 購物車：數量調整、小計、結帳 • 會員中心：訂單查詢、收藏清單、個人資料。3. 開始製作，分配任務。」

精簡扼要，不超過 10 行。語氣果斷。`, tech.name, 10000);

    fullDiscussion += `${tech.name}（${tech.role}）：\n${techText}\n\n`;
  } catch {
    onThinking('（整合中斷，繼續...）\n');
  }

  // ── Echo (PM): 最終確認 ──
  onThinking(`\n\n---\n\n${pm.emoji} **${pm.name}**（${pm.role}・最終確認）：\n\n`);
  try {
    const confirmText = await callAIStream(`你是 ${pm.name}，產品經理。團隊討論結束了，你要做最終確認。
${buildAgentContext('pm')}
客戶需求：「${userMessage.slice(0, 300)}」

團隊討論摘要：
${fullDiscussion.slice(-3000)}

請做最終確認（5 行以內）：
1. 有沒有遺漏的頁面或功能？（跟團隊提到的比對）
2. 導航流程有沒有死角？（每個頁面都能到達嗎？）
3. 最終確認的頁面清單

PAGES: 頁面1, 頁面2, ...`, pm.name, 6000);

    fullDiscussion += `${pm.name}（最終確認）：\n${confirmText}\n\n`;
  } catch {
    onThinking('（確認中斷，繼續...）\n');
  }

  // ── 產出 JSON Plan ──
  onThinking('\n\n⏳ 整合討論結果...\n');
  let plan: GenerationPlan | null = null;

  try {
    plan = await callAIJSON(`根據以下團隊討論，產出最終設計方案 JSON。

客戶需求：「${userMessage.slice(0, 300)}」

團隊討論：
${fullDiscussion.slice(0, 4000)}

回傳 JSON：
{
  "thinking": "一句話總結",
  "pages": [
    { "name": "頁面名稱（2-6中文字）", "description": "這頁做什麼", "keyFeatures": ["功能1", "功能2", "功能3"] }
  ],
  "navigation": [
    { "from": "來源頁", "to": "目標頁", "trigger": "觸發方式" }
  ],
  "constraints": ["重要注意事項"]
}

規則：頁面 4-6 個，名稱 2-6 個中文字不含標點，keyFeatures 至少 3 個。`, tech.name);
  } catch {
    // Fallback: extract from LAST PAGES line (confirmation round takes priority)
    const allPagesMatches = [...fullDiscussion.matchAll(/PAGES:\s*(.+)/gi)];
    const pagesMatch = allPagesMatches.length > 0 ? allPagesMatches[allPagesMatches.length - 1] : null;
    if (pagesMatch) {
      const extracted = pagesMatch[1].split(/[,、，]/)
        .map(p => p.trim().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '').slice(0, 12))
        .filter(p => p && p.length >= 2);
      if (extracted.length >= 2) {
        plan = {
          thinking: '從團隊討論中提取',
          pages: extracted.map(name => ({ name, description: name, keyFeatures: [] })),
          navigation: [],
          constraints: [],
        };
      }
    }
  }

  if (!plan || !plan.pages || plan.pages.length < 2) {
    throw new Error('Planning pipeline failed');
  }

  // ── Plan Self-Verification ──
  if (plan && plan.pages.length > 0) {
    try {
      const verifyPrompt = `檢查以下生成計劃，找出問題並修正：

計劃：
${JSON.stringify(plan, null, 2)}

檢查項目：
1. 孤島頁面：有沒有頁面不在任何其他頁面的 navigationOut 裡？如果有，加入適當的導航。
2. 空描述：有沒有頁面的 description 或 keyFeatures 是空的？如果有，補上合理的內容。
3. 頁面數量：跟討論中提到的頁面數是否一致？

回傳修正後的完整 JSON（跟輸入格式相同）。如果沒問題就原樣回傳。`;

      const verified = await callAIJSON(verifyPrompt, 'PlanVerifier');
      if (verified && Array.isArray(verified.pages) && verified.pages.length >= plan.pages.length) {
        const added = verified.pages.length - plan.pages.length;
        if (added > 0) console.log(`[plan-verify] Added ${added} missing pages`);
        plan = verified;
        console.log('[plan-verify] Plan verified and updated');
      }
    } catch (e: any) {
      console.warn('[plan-verify] Failed, using original plan:', e.message?.slice(0, 50));
    }
  }

  onThinking(`\n✅ 方案確定：${plan!.pages.map(p => p.name).join('、')}\n`);
  console.log('[planner] Final plan:', plan!.pages.map(p => p.name));

  plan!.thinking = fullDiscussion;
  return plan!;
}
