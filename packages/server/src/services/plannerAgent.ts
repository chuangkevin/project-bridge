import { GoogleGenerativeAI } from '@google/generative-ai';
import { assignBatchKeys, getGeminiModel, markKeyBad, trackUsage } from './geminiKeys';

export interface GenerationPlan {
  pages: { name: string; description: string; keyFeatures: string[] }[];
  navigation: { from: string; to: string; trigger: string }[];
  constraints: string[];
  thinking: string;
}

/**
 * Multi-AI Discussion Pipeline:
 * 1. Product Manager — 分析需求、定義功能範圍
 * 2. UX Designer — 設計頁面結構、用戶流程
 * 3. Tech Lead — 審查可行性、補充盲點
 *
 * 3 個 agent 串流討論，結果合併成 GenerationPlan。
 */
export async function planAndReview(
  userMessage: string,
  onThinking: (text: string) => void,
): Promise<GenerationPlan> {
  const keys = assignBatchKeys(6);
  let keyIdx = 0;
  const getKey = () => keys[keyIdx++ % keys.length];

  // Helper: call AI with retry
  async function callAI(prompt: string, maxTokens: number = 3000): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = getKey();
      try {
        const genai = new GoogleGenerativeAI(key);
        const model = genai.getGenerativeModel({
          model: getGeminiModel(),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        });
        const result = await model.generateContentStream(prompt);
        let text = '';
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) text += t;
        }
        return text;
      } catch (e: any) {
        console.warn(`[planner] AI call failed (attempt ${attempt + 1}):`, e.message?.slice(0, 50));
        markKeyBad(key);
      }
    }
    throw new Error('All AI calls failed');
  }

  let fullDiscussion = '';

  // ── Agent 1: Product Manager ──
  onThinking('🧑‍💼 **產品經理** 正在分析需求...\n\n');
  try {
    const pmResponse = await callAI(`你是一位資深產品經理。用戶提出了以下需求：

「${userMessage.slice(0, 800)}」

請用繁體中文，以產品經理的角度分析：

1. **需求理解**：這是什麼類型的系統？核心價值是什麼？目標用戶是誰？
2. **功能拆解**：列出所有使用者提到的功能（用 • 列點）
3. **使用者沒提到但必要的功能**：根據你的經驗，這類系統還需要什麼？（例如：通知、個人資料、設定）
4. **潛在問題**：使用者可能沒想到的坑（例如：資料來源、隱私、濫用）
5. **建議頁面**：列出建議的頁面名稱（2-6字，至少4頁）

直接用自然語氣回答，像在團隊會議上討論。`, 2000);

    onThinking(pmResponse + '\n\n');
    fullDiscussion += '=== 產品經理 ===\n' + pmResponse + '\n\n';
  } catch {
    onThinking('（產品經理分析失敗，繼續...）\n\n');
  }

  // ── Agent 2: UX Designer ──
  onThinking('---\n\n🎨 **UX 設計師** 正在設計頁面結構...\n\n');
  try {
    const uxResponse = await callAI(`你是一位 UX 設計師。團隊正在討論一個新系統：

用戶需求：「${userMessage.slice(0, 500)}」

產品經理的分析：
${fullDiscussion.slice(0, 2000)}

請以 UX 設計師的角度：

1. **頁面設計**：根據 PM 的分析，確定每個頁面的具體內容（每頁列出 3-5 個核心 UI 元件）
2. **用戶流程**：從打開 app → 完成主要任務的步驟（用 → 箭頭表示）
3. **導航設計**：哪些按鈕連到哪個頁面？（列出所有跳轉關係）
4. **設計注意事項**：哪些地方容易做錯？（例如：地圖頁不要太重、聊天要即時更新的感覺）

最後，用這個格式列出最終頁面：
PAGES: 頁面1, 頁面2, 頁面3, 頁面4

頁面名稱 2-6 個中文字，不含標點。`, 2000);

    onThinking(uxResponse + '\n\n');
    fullDiscussion += '=== UX 設計師 ===\n' + uxResponse + '\n\n';
  } catch {
    onThinking('（UX 設計師分析失敗，繼續...）\n\n');
  }

  // ── Agent 3: Tech Lead — 產出最終 JSON ──
  onThinking('---\n\n👨‍💻 **技術主管** 正在整合方案...\n\n');
  let plan: GenerationPlan | null = null;
  try {
    const techResponse = await callAI(`你是技術主管。團隊已經討論了一個系統的設計：

用戶需求：「${userMessage.slice(0, 300)}」

團隊討論紀錄：
${fullDiscussion.slice(0, 3000)}

請整合所有意見，產出最終的 JSON 設計方案。

回傳格式（只回傳 JSON，不要其他文字）：
{
  "thinking": "技術主管的總結（2-3句話）",
  "pages": [
    { "name": "頁面名稱", "description": "這頁做什麼", "keyFeatures": ["功能1", "功能2", "功能3"] }
  ],
  "navigation": [
    { "from": "首頁", "to": "詳情", "trigger": "點擊卡片" }
  ],
  "constraints": ["重要注意事項"]
}

規則：
- 頁面名稱 2-6 個中文字
- 至少 4 頁，最多 6 頁
- keyFeatures 至少 3 個
- navigation 要完整（每頁至少 1 個入口）
- constraints 寫出 PM 和 UX 提到的注意事項`, 4096);

    // Try to parse as JSON
    let jsonText = techResponse.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1];
    // Find JSON object
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
    }

    plan = JSON.parse(jsonText) as GenerationPlan;

    if (plan.thinking) {
      onThinking(plan.thinking + '\n');
    }
    onThinking(`\n✅ 方案確定：${plan.pages.map(p => p.name).join('、')}\n`);

    console.log('[planner] Final plan:', plan.pages.map(p => p.name));
  } catch (e: any) {
    console.warn('[planner] Tech lead JSON failed:', e.message?.slice(0, 80));
    // Try to extract pages from UX designer's PAGES: line
    const pagesMatch = fullDiscussion.match(/PAGES:\s*(.+)/i);
    if (pagesMatch) {
      const extracted = pagesMatch[1].split(/[,、，]/)
        .map(p => p.trim().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '').slice(0, 12))
        .filter(p => p && p.length >= 2);
      if (extracted.length >= 2) {
        plan = {
          thinking: '從 UX 設計師的建議提取頁面',
          pages: extracted.map(name => ({ name, description: name, keyFeatures: [] })),
          navigation: [],
          constraints: [],
        };
        onThinking(`\n⚠️ 從討論中提取頁面：${extracted.join('、')}\n`);
      }
    }
  }

  if (!plan || !plan.pages || plan.pages.length < 2) {
    throw new Error('Planning pipeline failed — no valid pages produced');
  }

  // Store full discussion in thinking
  plan.thinking = fullDiscussion + '\n' + (plan.thinking || '');

  return plan;
}
