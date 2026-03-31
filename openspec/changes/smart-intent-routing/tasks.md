## 1. Fix Intent Classification

- [ ] 1.1 In `chat.ts` — add modification verb detection (`加上|改成|調整|刪掉|拿掉|換成|移到|加個|加一個`), when prototype exists + modification verb present → force micro-adjust, skip isObviousGenerate
- [ ] 1.2 In `intentClassifier.ts` — add more micro-adjust keywords for structural changes (「加入」「新增元件」「插入」「替換」)
- [ ] 1.3 Unit test: verify "在卡片上加一個 tag" with existing prototype → micro-adjust intent
- [ ] 1.4 Unit test: verify "設計一個購物網站" without prototype → full-page intent

## 2. Element Select Mode (Client)

- [ ] 2.1 Add `element-select` interaction mode to WorkspacePage — new toolbar button (cursor icon) toggles mode
- [ ] 2.2 In PreviewPanel — when element-select mode active, forward `element-click` events as element selection (store bridgeId + outerHTML)
- [ ] 2.3 Lift `selectedElement: { bridgeId, html, tagName }` state to WorkspacePage, pass down to ChatPanel
- [ ] 2.4 In bridgeScript.ts — add `set-element-select-mode` message handler, change cursor to crosshair, on click send `{ type: 'element-selected', bridgeId, outerHTML, tagName }`
- [ ] 2.5 Handle Escape key and re-click to deselect

## 3. Chat Input Element Context

- [ ] 3.1 In ChatPanel — when `selectedElement` is set, show context bar above input: "🎯 已選取：[tagName] [bridgeId]" with X dismiss button
- [ ] 3.2 When sending message with selectedElement, include `targetBridgeId` and `targetHtml` in POST body
- [ ] 3.3 After sending, clear selectedElement and deactivate element-select mode

## 4. Server Element-Targeted Adjust

- [ ] 4.1 In `chat.ts` — detect `targetBridgeId` in request body, skip intent classification, route to new element-adjust path
- [ ] 4.2 Create `packages/server/src/prompts/element-adjust.txt` — prompt that takes element HTML + user instruction, returns modified HTML fragment only
- [ ] 4.3 Implement element-adjust handler: call AI with element HTML + instruction, get modified HTML back
- [ ] 4.4 Replace element in full prototype HTML by matching `data-bridge-id`, run div balance check
- [ ] 4.5 Save updated prototype as new version, return via SSE

## 5. Enhance Micro-Adjust for HTML Changes

- [ ] 5.1 Update `micro-adjust.txt` prompt — add instructions for adding/removing HTML elements (not just CSS)
- [ ] 5.2 Add examples: "加一個 badge"、"刪掉這個按鈕"、"在表格加一欄" to guide AI
- [ ] 5.3 Post-process: validate modified HTML, fix div balance if needed

## 6. Testing

- [ ] 6.1 Playwright E2E: click element in iframe → context bar appears → send modify message → element updated
- [ ] 6.2 Unit test: element replacement in HTML by bridge-id
- [ ] 6.3 Unit test: intent routing with modification verbs + existing prototype
