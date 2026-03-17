## 1. CSS 萃取工具

- [x] 1.1 Create `packages/client/src/utils/cssExtractor.ts`: export `extractStyleTokens(html: string): StyleToken[]` — 掃描 `<style>` 標籤中的 `:root` CSS 變數，解析 name/value/type（color/size/font）
- [x] 1.2 Implement fallback in `extractStyleTokens`: 當無 CSS 變數時，掃描 inline style 中出現頻率最高的顏色與 border-radius 值（最多 6 個）
- [x] 1.3 Ensure `<style id="__tweaker__">` is excluded from extraction

## 2. iframe 即時注入

- [x] 2.1 In `packages/client/src/utils/bridgeScript.ts`: add handler for `{ type: 'inject-styles', css: string }` — upsert `<style id="__tweaker__">` in document head
- [x] 2.2 In `WorkspacePage.tsx`: add `injectStyles(css: string)` helper that posts `inject-styles` message to the prototype iframe ref

## 3. 後端 PATCH 端點

- [x] 3.1 Create `packages/server/src/routes/prototypes.ts` (or add to existing projects route): `PATCH /api/projects/:id/prototype/styles` accepts `{ css: string }`, upserts `<style id="__tweaker__">` before `</body>` in current version HTML, updates `prototype_versions.html`
- [x] 3.2 Register the new route in `packages/server/src/index.ts`

## 4. StyleTweakerPanel 元件

- [x] 4.1 Create `packages/client/src/components/StyleTweakerPanel.tsx`: accepts `{ html: string; onInject: (css: string) => void; onSave: () => void }` props
- [x] 4.2 On mount and when `html` prop changes, call `extractStyleTokens(html)` to populate token list; reset tweaked values
- [x] 4.3 Render color tokens as `<input type="color">` + hex text input; onChange calls `onInject` with updated CSS variable overrides
- [x] 4.4 Render size tokens as range slider with px label; onChange calls `onInject`
- [x] 4.5 Render font tokens as select dropdown (System / Sans-serif / Serif / Monospace); onChange calls `onInject`
- [x] 4.6 Show empty state message when no tokens extracted
- [x] 4.7 Add「儲存樣式」button (`data-testid="save-styles-btn"`); calls `onSave`; show success/error toast

## 5. WorkspacePage 整合

- [x] 5.1 Add「🎨 樣式」tab to the right panel tab bar (`data-testid="tab-style"`); disabled when no current prototype HTML
- [x] 5.2 Pass current prototype HTML to `StyleTweakerPanel`; connect `onInject` to `injectStyles` helper
- [x] 5.3 Implement `handleSaveStyles`: calls `PATCH /api/projects/:id/prototype/styles` with current generated CSS string; show toast on success/failure
- [x] 5.4 When `onHtmlGenerated` fires (new prototype generated), reset StyleTweakerPanel by updating `html` prop

## 6. Playwright 測試

- [x] 6.1 API test: `PATCH /api/projects/:id/prototype/styles` with no prototype returns 404
- [x] 6.2 API test: after generating HTML, `PATCH` saves style tag into HTML; subsequent GET prototype contains `<style id="__tweaker__">`
- [x] 6.3 E2E test: 「🎨 樣式」tab disabled when no prototype; enabled after prototype generated
- [x] 6.4 E2E test: color token picker visible in StyleTweakerPanel when prototype with CSS variables loaded
- [x] 6.5 E2E test: click「儲存樣式」shows success toast
