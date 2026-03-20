## 1. Server: HTML Parsing

- [x] 1.1 Add `parseNavigationGraph(html: string)` function to `prototypeValidator.ts` that extracts all `data-page` values and all `showPage('...')`/`showPage("...")` targets with their source page context
- [x] 1.2 Handle edge cases: dynamic showPage calls (variable args), template literals, nested quotes
- [x] 1.3 Write unit test: verify parsing of sample HTML with multiple pages, showPage calls, and dynamic calls
- [x] 1.4 Commit: "feat: add HTML navigation graph parser in prototypeValidator"

## 2. Server: Graph Analysis

- [x] 2.1 Implement `validateNavigation(html: string): ValidationResult` function that calls `parseNavigationGraph` and runs checks
- [x] 2.2 Implement missing-target detection: check every showPage target exists as a data-page
- [x] 2.3 Implement orphan detection: BFS from entry page, report unreachable pages
- [x] 2.4 Implement dead-end detection: find pages with zero outgoing showPage calls (exempt entry page and pages with back/home navigation)
- [x] 2.5 Implement tab/state mismatch detection: parse data-tab attributes and verify targets
- [x] 2.6 Write unit test: sample HTML with known missing targets, orphans, dead-ends; verify correct warnings
- [x] 2.7 Commit: "feat: add validateNavigation with graph analysis for orphans, dead-ends, missing targets"

## 3. Server: Pipeline Integration

- [x] 3.1 Call `validateNavigation()` after `validatePrototype()` in chat.ts post-generation pipeline
- [x] 3.2 Merge navigation checks into the overall `ValidationResult` passed to `logValidation()`
- [x] 3.3 Store navigation validation results alongside prototype data (add to response or DB field)
- [x] 3.4 Write Playwright test: generate a prototype, verify navigation validation runs and results appear in server logs
- [x] 3.5 Commit: "feat: integrate navigation validator into post-generation pipeline"

## 4. Client: Warning Display

- [x] 4.1 Add navigation warning badge component that shows warning count on the prototype preview
- [x] 4.2 Add expandable warning panel listing each navigation issue with name and detail
- [x] 4.3 Fetch/receive validation results from generation response and pass to warning component
- [x] 4.4 Hide badge when zero navigation warnings
- [x] 4.5 Write Playwright test: generate prototype with known navigation issues, verify badge appears with correct count, click to expand and see details
- [x] 4.6 Commit: "feat: display navigation validation warnings in prototype preview UI"
