import { GoogleGenerativeAI } from '@google/generative-ai';
import { assignBatchKeys, getGeminiModel, markKeyBad, trackUsage } from './geminiKeys';

export interface GenerationPlan {
  pages: { name: string; description: string; keyFeatures: string[] }[];
  navigation: { from: string; to: string; trigger: string }[];
  constraints: string[];
  thinking: string;
}

/**
 * Step 1: Planner AI — analyzes user request, determines pages and features.
 * Step 2: Reviewer AI — checks planner output, fixes issues.
 * Returns the final reviewed plan.
 *
 * Uses 2 sequential API calls (can use same key).
 * Retries up to 5 keys on 429.
 */
export async function planAndReview(
  userMessage: string,
  onThinking: (text: string) => void,
): Promise<GenerationPlan> {
  const keys = assignBatchKeys(5); // get 5 random keys for retries

  let plan: GenerationPlan | null = null;

  // Step 1: Planner
  for (const key of keys) {
    if (plan) break;
    try {
      const genai = new GoogleGenerativeAI(key);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json' },
      });

      const plannerPrompt = `你是資深 UI 設計師。分析以下需求，決定需要哪些頁面和功能。

用戶需求：「${userMessage.slice(0, 500)}」

回傳 JSON：
{
  "thinking": "用繁體中文，5-10 行的分析思路（這是什麼系統、目標用戶、核心流程、需要什麼頁面、為什麼）",
  "pages": [
    { "name": "頁面名稱（2-6個中文字）", "description": "一句話描述這頁做什麼", "keyFeatures": ["功能1", "功能2", "功能3"] }
  ],
  "navigation": [
    { "from": "首頁", "to": "詳情頁", "trigger": "點擊卡片" }
  ],
  "constraints": ["特殊注意事項，例如：這不是訂餐系統而是揪團系統"]
}

規則：
- 頁面名稱 2-6 個中文字，不含標點
- 至少 3 頁，最多 6 頁
- 仔細理解需求核心 — 例如「揪團吃飯」的核心是揪團社交，不是點餐外送
- navigation 要完整 — 每個頁面至少有 1 個入口
- keyFeatures 至少 3 個具體功能`;

      const result = await model.generateContent(plannerPrompt);
      try { trackUsage(key, getGeminiModel(), 'planner', result.response.usageMetadata); } catch { /* non-fatal */ }

      let text = result.response.text().trim();
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) text = fenceMatch[1];

      plan = JSON.parse(text) as GenerationPlan;

      // Stream thinking to client
      if (plan.thinking) {
        onThinking(plan.thinking);
      }

      console.log('[planner] Plan:', plan.pages.map(p => p.name));
    } catch (e: any) {
      console.warn('[planner] Failed on key ...' + key.slice(-4) + ':', e.message?.slice(0, 50));
      markKeyBad(key);
    }
  }

  if (!plan || !plan.pages || plan.pages.length < 2) {
    throw new Error('Planner failed to produce a valid plan');
  }

  // Step 2: Reviewer — check and fix the plan
  for (const key of keys) {
    try {
      const genai = new GoogleGenerativeAI(key);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 2000, temperature: 0.2, responseMimeType: 'application/json' },
      });

      const reviewPrompt = `你是 UI 設計審查員。檢查以下設計方案是否符合用戶需求。

用戶需求：「${userMessage.slice(0, 300)}」

設計方案：
${JSON.stringify(plan, null, 2)}

請檢查：
1. 頁面是否覆蓋了用戶的所有需求？（漏掉了什麼功能？）
2. 頁面名稱是否準確反映內容？（不要用太泛的名稱如「功能頁」）
3. 導航是否完整？（能從任何頁面到達所有主要頁面嗎？）
4. 有沒有誤解需求？（例如把「揪團吃飯」當成「訂餐外送」）

回傳修正後的 JSON（同樣格式），在 thinking 欄位加上你的審查意見。
如果方案沒問題，原樣回傳即可。`;

      const reviewResult = await model.generateContent(reviewPrompt);
      try { trackUsage(key, getGeminiModel(), 'reviewer', reviewResult.response.usageMetadata); } catch { /* non-fatal */ }

      let reviewText = reviewResult.response.text().trim();
      const reviewFence = reviewText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (reviewFence) reviewText = reviewFence[1];

      const reviewed = JSON.parse(reviewText) as GenerationPlan;

      if (reviewed.pages && reviewed.pages.length >= 2) {
        // Stream reviewer thinking
        if (reviewed.thinking && reviewed.thinking !== plan.thinking) {
          onThinking('\n\n--- 設計審查 ---\n' + reviewed.thinking);
        }
        plan = reviewed;
        console.log('[reviewer] Reviewed plan:', plan.pages.map(p => p.name));
      }
      break; // success
    } catch (e: any) {
      console.warn('[reviewer] Failed:', e.message?.slice(0, 50));
      // Reviewer failure is not critical — use planner's plan
      break;
    }
  }

  return plan;
}
