## 1. Server: Gemini Thinking Mode

- [ ] 1.1 在 chat.ts 的 generateContentStream 呼叫加入 `thinkingConfig: { thinkingBudget: 2048 }`
- [ ] 1.2 解析 Gemini stream chunk — 區分 `thought: true` parts 和普通 text parts
- [ ] 1.3 Thinking parts 發送 `{ type: 'thinking', content }` SSE 事件
- [ ] 1.4 加入 try/catch fallback：thinkingConfig 不支援時自動降級為無 thinking 模式

## 2. Server: Phase Events

- [ ] 2.1 第一個 thinking token 到達時發送 `{ type: 'phase', phase: 'analyzing', message: '分析需求中...' }`
- [ ] 2.2 `analyzePageStructure` 執行時發送 `{ type: 'phase', phase: 'planning', message: '規劃頁面結構...' }`
- [ ] 2.3 第一個 HTML output token 到達時發送 `{ type: 'phase', phase: 'generating', message: '生成程式碼...' }`
- [ ] 2.4 生成完成時發送 `{ type: 'phase', phase: 'done' }`（在 done 事件之前）
- [ ] 2.5 Question/micro-adjust intent 只發送 analyzing + done 階段

## 3. Client: SSE Event Handler 擴充

- [ ] 3.1 ChatPanel SSE 處理器識別 `type: 'thinking'` 事件，累積 thinking content 到 state
- [ ] 3.2 識別 `type: 'phase'` 事件，更新 generationPhase state（4 步：analyzing/planning/generating/done）
- [ ] 3.3 無 `type` 欄位的事件維持現有行為（backward compatible）

## 4. Client: Thinking Panel UI

- [ ] 4.1 新增 ThinkingPanel 元件：可收合面板，顯示 AI 思考內容（monospace，auto-scroll）
- [ ] 4.2 面板標題顯示 `🧠 AI 正在思考...` + 收合/展開按鈕
- [ ] 4.3 生成完成後 1 秒自動收合
- [ ] 4.4 整合 ThinkingPanel 到 ChatPanel 的生成進度區域

## 5. Client: Progress Stepper 升級

- [ ] 5.1 將現有 3-step stepper 改為 4-step：分析需求 → 規劃結構 → 生成程式碼 → 完成
- [ ] 5.2 每步顯示狀態：待處理（灰）、進行中（紫色動畫）、完成（綠色勾）
- [ ] 5.3 新增 token 計數器，顯示輸出字元數（每收到 content 事件累加）

## 6. 測試

- [ ] 6.1 手動測試：送出生成請求，確認 thinking panel 顯示思考內容
- [ ] 6.2 手動測試：確認 4 步 stepper 正確切換
- [ ] 6.3 手動測試：確認 question intent 不顯示 thinking panel
- [ ] 6.4 確認 Gemini 不支援 thinking 時（fallback）生成仍正常運作
- [ ] 6.5 E2E 測試：生成過程中 thinking panel 可見
