import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel } from './geminiKeys';
import { withGeminiRetry, withStreamRetry } from './geminiRetry';

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
): Promise<GenerationPlan> {
  async function callAIStream(prompt: string, agentName: string, maxTokens: number = 8000): Promise<string> {
    let text = '';
    await withStreamRetry(async (apiKey) => {
      text = ''; // reset on retry
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
      });
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const t = chunk.text();
        if (t) {
          text += t;
          onThinking(t); // stream each chunk to client
        }
      }
    }, { maxRetries: 2, callType: agentName });
    return text;
  }

  async function callAIJSON(prompt: string, agentName: string): Promise<any> {
    return withGeminiRetry(async (apiKey) => {
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      return JSON.parse(text);
    }, { maxRetries: 2, callType: agentName });
  }

  let fullDiscussion = '';

  // Build skills context for all agents
  const skillsContext = skills.length > 0
    ? `\n\n=== 專案知識庫（所有 Agent 都可以參考）===\n${skills.slice(0, 8).map(s => `【${s.name}】${s.description}\n${s.content.slice(0, 500)}`).join('\n\n')}\n===\n`
    : '';
  const { pm, ux, tech } = AGENTS;

  // ── Echo (PM): 分析需求 ──
  onThinking(`${pm.emoji} **${pm.name}**（${pm.role}）：\n\n`);
  let pmText = '';
  try {
    pmText = await callAIStream(`你是 ${pm.name}，一位資深產品經理。你正在團隊會議上分析客戶需求。
${skillsContext}
客戶說：「${userMessage.slice(0, 800)}」

請用繁體中文，以 ${pm.name} 的口吻直接發言。⚠️ 控制在 15 行以內，精簡扼要：

1. 一句話總結這是什麼系統
2. 客戶提到的功能（• 列點，每點一行）
3. 客戶沒提到但必要的功能（• 列點，最多 5 個）
4. 2-3 個潛在的坑（每個 1 行）
5. 建議頁面名稱（2-6 字，一行列完）

語氣像開會：精準、不囉唆。`, pm.name, 8000);

    fullDiscussion += `${pm.name}（${pm.role}）：\n${pmText}\n\n`;
  } catch {
    onThinking('（分析中斷，繼續...）\n');
  }

  // ── Lisa (UX): 回應 PM，設計頁面 ──
  onThinking(`\n\n---\n\n${ux.emoji} **${ux.name}**（${ux.role}）：\n\n`);
  let uxText = '';
  try {
    uxText = await callAIStream(`你是 ${ux.name}，UX 設計師。你在團隊會議上，剛聽完 ${pm.name}（產品經理）的分析。
${skillsContext}
客戶需求：「${userMessage.slice(0, 500)}」

${pm.name} 的分析：
${pmText.slice(0, 2000)}

請用繁體中文，以 ${ux.name} 的口吻。⚠️ 控制在 15 行以內：

1. 簡短回應 ${pm.name}（1-2 句，同意或反駁）
2. 每個頁面的核心元件（每頁 1 行：「頁面名：元件1、元件2、元件3」）
3. 用戶流程（用 → 連接，1 行搞定）
4. UX 注意事項（2-3 點，每點 1 行）

最後一行：PAGES: 頁面1, 頁面2, 頁面3, ...

精簡！不要展開每個元件的詳細說明。`, ux.name, 8000);

    fullDiscussion += `${ux.name}（${ux.role}）：\n${uxText}\n\n`;
  } catch {
    onThinking('（設計中斷，繼續...）\n');
  }

  // ── David (QA): 審查方案，找盲點 ──
  const { qa } = AGENTS;
  onThinking(`\n\n---\n\n${qa.emoji} **${qa.name}**（${qa.role}）：\n\n`);
  let qaText = '';
  try {
    qaText = await callAIStream(`你是 ${qa.name}，QA 審查員。你剛聽完 ${pm.name} 和 ${ux.name} 的討論。
${skillsContext}
客戶需求：「${userMessage.slice(0, 300)}」

${pm.name} 說：${pmText.slice(0, 800)}
${ux.name} 說：${uxText.slice(0, 800)}

以 ${qa.name} 的口吻。⚠️ 控制在 10 行以內，直接點問題：

1. 漏掉的使用場景（2-3 個，每個 1 行）
2. 哪個頁面描述太模糊？（指名 1-2 個）
3. 導航死角？（1-2 個）

語氣：code review 風格，直接指出問題。`, qa.name, 6000);

    fullDiscussion += `${qa.name}（${qa.role}）：\n${qaText}\n\n`;
  } catch {
    onThinking('（審查中斷，繼續...）\n');
  }

  // ── Bob (Tech Lead): 最終整合 + 明確總結 ──
  onThinking(`\n\n---\n\n${tech.emoji} **${tech.name}**（${tech.role}）：\n\n`);
  let techText = '';
  try {
    techText = await callAIStream(`你是 ${tech.name}，技術主管。團隊討論完了，你要做最後總結。
${skillsContext}
客戶需求：「${userMessage.slice(0, 300)}」

${pm.name}（產品經理）：${pmText.slice(0, 1000)}
${ux.name}（UX 設計師）：${uxText.slice(0, 1000)}
${qa.name}（QA 審查員）：${qaText.slice(0, 1000)}

以 ${tech.name} 的口吻。⚠️ 控制在 10 行以內：

1. 一句話整合結論
2. 回應 ${qa.name} 的問題（每個 1 句話解決）
3. 最終頁面清單（「• 頁面名：3 個核心功能」格式，每頁 1 行）
4. 「開始製作，分配任務。」

語氣果斷。`, tech.name, 6000);

    fullDiscussion += `${tech.name}（${tech.role}）：\n${techText}\n\n`;
  } catch {
    onThinking('（整合中斷，繼續...）\n');
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
    // Fallback: extract from UX PAGES line
    const pagesMatch = fullDiscussion.match(/PAGES:\s*(.+)/i);
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

  onThinking(`\n✅ 方案確定：${plan.pages.map(p => p.name).join('、')}\n`);
  console.log('[planner] Final plan:', plan.pages.map(p => p.name));

  plan.thinking = fullDiscussion;
  return plan;
}
