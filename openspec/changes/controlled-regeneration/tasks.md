## Phase 1: Intent classifier — add `micro-adjust` intent

- [x] 1.1 Update `Intent` type in `packages/server/src/services/intentClassifier.ts` from 4 intents to 5: add `'micro-adjust'`
- [x] 1.2 Update classifier system prompt to include `micro-adjust` intent with keywords: "變大", "變小", "顏色改", "change color", "add padding", "字體", "間距", "背景色", "粗體", "邊框", "圓角", "margin", "font size", "bigger", "smaller", "wider", "narrower", "加陰影", "移除", "隱藏", "顯示"
- [x] 1.3 Add `micro-adjust` return handling in the response parsing (after `if (text === 'question')` block)
- [x] 1.4 Write Playwright test: send micro-adjust-type messages via API, verify classified intent is `micro-adjust`
- [x] 1.5 Run test, verify pass, commit: `feat: add micro-adjust intent type to classifier`

## Phase 2: Micro-adjust generation flow in chat.ts

- [x] 2.1 Create micro-adjust system prompt in `packages/server/src/prompts/micro-adjust.txt` — instructs AI to return complete HTML with only requested changes, preserve everything else
- [x] 2.2 Accept `forceRegenerate` boolean from request body in `POST /api/projects/:id/chat`
- [x] 2.3 Gate `isObviousGenerate` fast-path: only fire when no current prototype exists OR `forceRegenerate` is true
- [x] 2.4 After intent classification, if prototype exists AND intent is `full-page` or `in-shell` AND `forceRegenerate` is not set, override intent to `micro-adjust`
- [x] 2.5 Add micro-adjust branch in chat.ts: load current prototype HTML from `prototype_versions`, send to Gemini with micro-adjust prompt + user message + trimmed history, `maxOutputTokens: 32768`
- [x] 2.6 Apply `sanitizeGeneratedHtml` and `injectConventionColors` on micro-adjust output, store as new prototype version
- [x] 2.7 Send SSE done event with `messageType: 'micro-adjust'` and `intent: 'micro-adjust'`
- [x] 2.8 Store assistant message in `conversations` with `message_type = 'micro-adjust'`
- [x] 2.9 Write Playwright test: create project, generate prototype, then send a micro-adjust message ("把標題變大"), verify new prototype version is created and HTML differs only in targeted area
- [x] 2.10 Run test, verify pass, commit: `feat: add micro-adjust generation flow for targeted CSS/HTML changes`

## Phase 3: Regenerate button in ChatPanel

- [x] 3.1 Add `hasPrototype` state to ChatPanel (derived from messages containing generate/in-shell/component messageTypes, or set via prop)
- [x] 3.2 Add "重新生成" button in `inputArea` div, next to send button, visible only when `hasPrototype` is true
- [x] 3.3 Style regenerate button distinctly (amber/orange background, refresh icon)
- [x] 3.4 Wire regenerate button click: call `sendMessage` with `forceRegenerate: true` flag (extend sendMessage to accept options)
- [x] 3.5 Update `sendMessage` to pass `forceRegenerate` in request body when set
- [x] 3.6 Change send button tooltip to "微調" when `hasPrototype` is true
- [x] 3.7 Add `messageType: 'micro-adjust'` handling in message display — show "微調完成" badge with light blue background
- [x] 3.8 Update generation progress label: show "微調中..." when intent is micro-adjust
- [x] 3.9 Write Playwright test: open project in browser, generate prototype, verify regenerate button appears, click send for a tweak, verify micro-adjust flow triggers, click regenerate, verify full generation triggers
- [x] 3.10 Run test, verify pass, commit: `feat: add Regenerate button and micro-adjust UI to ChatPanel`

## Phase 4: Integration test + polish

- [x] 4.1 Open app in Playwright, create project, upload design spec, generate full prototype
- [x] 4.2 Send micro-adjust message ("把按鈕變大"), verify prototype updates with minimal changes, verify "微調完成" badge shows
- [x] 4.3 Click Regenerate button, verify full generation runs with all project context loaded
- [x] 4.4 Verify conversation history shows correct messageTypes: 'generate' for full, 'micro-adjust' for tweaks
- [x] 4.5 Test edge case: send micro-adjust when no prototype exists — should fall through to full generation
- [x] 4.6 Clean up test artifacts, update `.gitignore` if needed
- [x] 4.7 Run full test suite, verify pass, commit: `test: validate controlled regeneration with micro-adjust and regenerate button`
