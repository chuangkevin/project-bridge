## 1. HTML Output Sanitizer

- [x] 1.1 Create `sanitizeGeneratedHtml()` function in `packages/server/src/services/htmlSanitizer.ts` — merge duplicate `<style>` tags, fix missing closing tags, inject showPage if missing
- [x] 1.2 Integrate sanitizer into `chat.ts` — call after AI response, before storing prototype
- [x] 1.3 Write unit-style test: feed known-bad HTML (dual style, truncated) → verify sanitizer fixes it
- [x] 1.4 Run test, verify pass, commit: `fix: add HTML output sanitizer for AI-generated prototypes`

## 2. Color Convention Override Injection

- [x] 2.1 Add `injectConventionColors()` in htmlSanitizer — parse convention from DB, inject `:root { --primary: #hex }` override
- [x] 2.2 Integrate into chat.ts after sanitization — only when design convention is active
- [x] 2.3 Write test: generate HTML with convention → verify computed --primary matches convention color
- [x] 2.4 Run test, verify pass, commit: `fix: inject convention colors as CSS override in generated prototypes`

## 3. Generation Quality Validator

- [x] 3.1 Create `validatePrototype()` function in `packages/server/src/services/prototypeValidator.ts` — check pages present, content length, color match, navigation flow
- [x] 3.2 Integrate validator into chat.ts — run after sanitization, log warnings (non-blocking)
- [x] 3.3 Write Playwright test: upload spec PDF → generate → validate all checks pass
- [x] 3.4 Run test, verify pass, commit: `feat: add prototype quality validator with page/color/navigation checks`

## 4. Full E2E Validation + Cleanup

- [x] 4.1 Open app in Playwright, upload `批次自動刷新設定_規格書.pdf`, wait for analysis
- [x] 4.2 Send "請依照規格書生成所有頁面", capture generated prototype
- [x] 4.3 Screenshot each page, verify: purple colors, correct pages, navigation works, no placeholder content
- [x] 4.4 Add `.gitignore` entries for test artifacts (*.traineddata, test-output.html, screenshots, .playwright-mcp/)
- [x] 4.5 Clean up temp test files from repo root
- [x] 4.6 Final commit: `test: validate full upload→analyze→generate pipeline with Playwright`
