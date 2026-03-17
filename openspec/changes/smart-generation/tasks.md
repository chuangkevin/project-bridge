## 1. Database Migration

- [ ] 1.1 Create migration 004_smart_generation.sql: add `art_style_preferences` table (project_id UNIQUE, detected_style TEXT, apply_style INTEGER DEFAULT 0, updated_at); add `is_multi_page INTEGER DEFAULT 0` and `pages TEXT DEFAULT '[]'` columns to `prototype_versions`

## 2. Intent Classification

- [ ] 2.1 Create `packages/server/src/services/intentClassifier.ts`: classify message as "generate" | "question" using gpt-4o-mini (max_tokens: 5)
- [ ] 2.2 In chat route: call intentClassifier before processing; branch to Q&A path or generate path based on result
- [ ] 2.3 Q&A path: use Q&A system prompt, stream answer via SSE, save conversation, do NOT create PrototypeVersion
- [ ] 2.4 Add `message_type` field to conversations table (via migration 004): "generate" | "answer" | "user", default "user"/"generate" for existing data

## 3. Art Style Detection

- [ ] 3.1 Create `packages/server/src/services/artStyleExtractor.ts`: extract images from PPTX (read ppt/media/ from ZIP) and DOCX (read word/media/ from ZIP), return up to 3 image buffers
- [ ] 3.2 Create art style analyzer: send extracted images to gpt-4o vision with art style analysis prompt, return style summary text
- [ ] 3.3 In upload route: after text extraction, call artStyleExtractor if file is pptx/docx; if images found, analyze art style and upsert `art_style_preferences`
- [ ] 3.4 Implement GET `/api/projects/:id/art-style`: return art style preference (detected_style, applyStyle)
- [ ] 3.5 Implement PUT `/api/projects/:id/art-style`: body `{ applyStyle: boolean }`, update apply_style field
- [ ] 3.6 In chat route generate path: fetch art style preference; if apply_style=true, append art style block to system prompt (after Design Profile block, before MULTI-PAGE block if present)

## 4. Multi-Page Detection & Generation

- [ ] 4.1 Create `packages/server/src/services/pageStructureAnalyzer.ts`: send user message to gpt-4o-mini, parse JSON response `{multiPage: boolean, pages: string[]}`
- [ ] 4.2 In chat route generate path: call pageStructureAnalyzer; if multiPage=true, append multi-page structure block to system prompt
- [ ] 4.3 After generation completes: if multiPage=true, save PrototypeVersion with is_multi_page=1 and pages=JSON
- [ ] 4.4 Update GET `/api/projects/:id` and share endpoint to include current prototype's is_multi_page and pages

## 5. Frontend — Q&A Visual Distinction

- [ ] 5.1 Update ChatPanel to accept `messageType` field on messages: "answer" gets blue left border + 💬 icon; "generate" gets gray bg + "✅ 已生成原型" tag; "user" stays unchanged
- [ ] 5.2 Fetch `message_type` from GET `/api/projects/:id/conversations`

## 6. Frontend — Art Style Card

- [ ] 6.1 In ChatPanel (or above it), fetch art style on mount and when files are uploaded
- [ ] 6.2 Show "🎨 偵測到美術風格" card when detected_style is non-empty: 1-line summary, toggle switch
- [ ] 6.3 Toggle switch calls PUT `/api/projects/:id/art-style`; show toast on save

## 7. Frontend — Multi-Page Navigation Bar

- [ ] 7.1 In WorkspacePage: when current prototype has is_multi_page=true and pages.length > 1, show a tab bar above the iframe
- [ ] 7.2 Each tab is a button with the page name; clicking sends postMessage `{ type: 'navigate', page }` to iframe
- [ ] 7.3 Track active page tab in state, highlight active tab
- [ ] 7.4 Update bridge script (src/utils/bridgeScript.ts) to handle `{ type: 'navigate', page }` messages — find `div[data-page]` elements and show/hide accordingly

## 8. Playwright Testing

- [ ] 8.1 API tests: intent classification via chat endpoint (question message returns no new prototype version; generate message creates one)
- [ ] 8.2 API tests: GET/PUT art-style preference
- [ ] 8.3 API tests: GET project includes is_multi_page and pages for current prototype
- [ ] 8.4 E2E tests: send a question, verify prototype not updated, Q&A bubble style appears
- [ ] 8.5 E2E tests: art style card appears after uploading pptx/docx with images; toggle switch
- [ ] 8.6 E2E tests: multi-page tab bar appears when prototype is multi-page; click tab sends navigate
