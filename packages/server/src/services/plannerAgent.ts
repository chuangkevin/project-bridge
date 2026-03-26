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
): Promise<GenerationPlan> {
  const keys = assignBatchKeys(6);
  let keyIdx = 0;
  const getKey = () => keys[keyIdx++ % keys.length];

  async function callAIStream(prompt: string, agentName: string, maxTokens: number = 4000): Promise<string> {
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
  const { pm, ux, tech } = AGENTS;

  // ── Echo (PM): 分析需求 ──
  onThinking(`${pm.emoji} **${pm.name}**（${pm.role}）：\n\n`);
  let pmText = '';
  try {
    pmText = await callAIStream(`你是 ${pm.name}，一位資深產品經理。你正在團隊會議上分析客戶需求。

客戶說：「${userMessage.slice(0, 800)}」

請用繁體中文，以 ${pm.name} 的口吻直接發言（不要說「作為產品經理」，直接講）：

1. 先用一句話總結這是什麼系統
2. 列出客戶明確提到的功能（用 • 列點）
3. 列出客戶沒提到但一定需要的功能（根據你做過類似產品的經驗）
4. 提出 2-3 個客戶可能沒想到的坑
5. 建議需要哪些頁面（列出頁面名稱，2-6 個字）

語氣自然，像在開會，可以用「我覺得」「這邊要注意」這種口語。`, pm.name, 4000);

    fullDiscussion += `${pm.name}（${pm.role}）：\n${pmText}\n\n`;
  } catch {
    onThinking('（分析中斷，繼續...）\n');
  }

  // ── Lisa (UX): 回應 PM，設計頁面 ──
  onThinking(`\n\n---\n\n${ux.emoji} **${ux.name}**（${ux.role}）：\n\n`);
  let uxText = '';
  try {
    uxText = await callAIStream(`你是 ${ux.name}，UX 設計師。你在團隊會議上，剛聽完 ${pm.name}（產品經理）的分析。

客戶需求：「${userMessage.slice(0, 500)}」

${pm.name} 的分析：
${pmText.slice(0, 2000)}

請用繁體中文，以 ${ux.name} 的口吻回應 ${pm.name}：

1. 先回應 ${pm.name} 說得對不對（可以同意也可以反駁）
2. 從 UX 角度補充：每個頁面具體要放什麼元件？（例如：地圖、卡片列表、表單、聊天室）
3. 畫出用戶流程：打開 app → 第一步 → 第二步 → ... → 完成（用 → 表示）
4. 所有頁面之間的跳轉關係（例如：首頁點「查看」→ 詳情頁）
5. 提出 UX 上的注意事項（哪裡容易做醜或做錯）

最後一行寫：
PAGES: 頁面1, 頁面2, 頁面3, ...

語氣自然，像在跟同事討論，可以說「${pm.name} 說得沒錯，但我覺得...」`, ux.name, 4000);

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

客戶需求：「${userMessage.slice(0, 300)}」

${pm.name} 說：${pmText.slice(0, 800)}
${ux.name} 說：${uxText.slice(0, 800)}

以 ${qa.name} 的口吻，審查這個方案：
1. 有沒有漏掉的使用場景？（例如：使用者可能會...但方案沒考慮到）
2. 哪些頁面的功能描述太模糊？需要更具體
3. 導航流程有沒有死角？（某個操作後使用者會卡住？）
4. 如果你是使用者，第一次打開這個 app，你會困惑什麼？

語氣直接，像在 code review：「這邊有個問題...」「${ux.name} 說的 XX 頁面缺少...」`, qa.name, 3000);

    fullDiscussion += `${qa.name}（${qa.role}）：\n${qaText}\n\n`;
  } catch {
    onThinking('（審查中斷，繼續...）\n');
  }

  // ── Bob (Tech Lead): 最終整合 + 明確總結 ──
  onThinking(`\n\n---\n\n${tech.emoji} **${tech.name}**（${tech.role}）：\n\n`);
  let techText = '';
  try {
    techText = await callAIStream(`你是 ${tech.name}，技術主管。團隊討論完了，你要做最後總結。

客戶需求：「${userMessage.slice(0, 300)}」

${pm.name}（產品經理）：${pmText.slice(0, 1000)}
${ux.name}（UX 設計師）：${uxText.slice(0, 1000)}
${qa.name}（QA 審查員）：${qaText.slice(0, 1000)}

以 ${tech.name} 的口吻做最終總結：

1. 「好，我整理一下大家的意見...」
2. 回應 ${qa.name} 提出的問題（怎麼解決）
3. 確認最終頁面清單：每個頁面一行，格式「• 頁面名：核心功能」
4. 「接下來我們開始製作，預計 X 個頁面...」

語氣果斷，像在做決定。`, tech.name, 3000);

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
