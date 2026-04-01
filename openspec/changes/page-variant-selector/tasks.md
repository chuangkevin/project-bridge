## 1. Variant Generation Engine

- [ ] 1.1 Create `generateVariants(page, plan, designConvention, skills, lesson?)` in parallelGenerator — generates 2 alternatives with different prompt strategies (結構導向 / 視覺導向)
- [ ] 1.2 Define 3 prompt strategy templates: standard (A), structure-focused (B), visual-focused (C)
- [ ] 1.3 Inject lesson into variant prompts: "上次問題是 XX，請用不同方式"
- [ ] 1.4 Limit variant trigger to max 2 pages per generation run

## 2. Auto-trigger Integration

- [ ] 2.1 In parallelGenerator — after generation, check which pages have QA lessons → trigger variants for top 2
- [ ] 2.2 In pre-assembly gate — when gate + retry both fail, generate variants instead of fallback
- [ ] 2.3 Push variants to client via SSE: `{ type: 'variant-select', page, variants: [{id, label, html}] }`

## 3. Manual Trigger

- [ ] 3.1 Add POST `/api/projects/:id/generate-variants` endpoint — accepts `{ page }`, generates 2 variants for that page using current prototype's spec
- [ ] 3.2 Return variants via SSE stream (same format as auto-trigger)

## 4. Variant Selection UI (Frontend)

- [ ] 4.1 In ChatPanel — handle `variant-select` SSE event, render variant selection card with 2-3 mini iframes
- [ ] 4.2 Mini iframe: use `<iframe srcDoc={html} sandbox="allow-scripts" style="transform: scale(0.4); width: 250%; height: 250%;" />` in a clipped container
- [ ] 4.3 "選這個" button per variant — sends POST to select-variant endpoint
- [ ] 4.4 After selection, replace card with "✅ 已選擇：方案 X"
- [ ] 4.5 Hover effect: scale up to 0.6 for better visibility

## 5. Variant Selection Endpoint

- [ ] 5.1 Add POST `/api/projects/:id/select-variant` — accepts `{ page, variantId, variantHtml }`
- [ ] 5.2 Replace page div in prototype HTML (match by `id="page-{name}"`)
- [ ] 5.3 Save as new prototype version
- [ ] 5.4 Delete related lessons for the selected page (lesson resolved)

## 6. Sidebar "其他方案" Button

- [ ] 6.1 In WorkspacePage sidebar page list — add 🔄 button next to each page name
- [ ] 6.2 Click → POST `/api/projects/:id/generate-variants` with page name
- [ ] 6.3 Show loading state while generating, disable button

## 7. Testing

- [ ] 7.1 Unit test: generateVariants produces 2 variants with different prompt strategies
- [ ] 7.2 Unit test: select-variant endpoint replaces page in HTML correctly
- [ ] 7.3 Unit test: lesson cleared after variant selection
- [ ] 7.4 E2E: variant-select SSE event renders selection UI in ChatPanel
