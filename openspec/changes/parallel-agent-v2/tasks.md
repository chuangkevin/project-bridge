# Tasks: parallel-agent-v2

## 1. Server — 砍掉多餘 API calls

- [x] 1.1 Remove analysis reasoning call — replaced with 4-agent discussion (Echo/Lisa/David/Bob)
- [x] 1.2 Remove analyzePageStructure call — planAndReview handles page detection
- [x] 1.3 Remove confirm dialog logic
- [x] 1.4 isObviousGenerate — keyword pair detection (generate+type)

## 2. Server — Key Dispatch

- [x] 2.1 assignBatchKeys with Fisher-Yates shuffle
- [x] 2.2 parallelGenerator uses assignBatchKeys
- [x] 2.3 Each sub-agent gets unique key, random selection (no round-robin)
- [x] 2.4 markKeyBad with 2-min cooldown for 429/error keys
- [x] 2.5 Analysis retries up to 3 different keys

## 3. Server — Force Parallel Path

- [x] 3.1 isMultiPage always uses parallel path
- [x] 3.2 parallelGenerator always uses buildLocalPlan (no master agent AI call)
- [x] 3.3 Sub-agent retry max 2 per page with markKeyBad
- [x] 3.4 >50% failure = error to user (no single-call fallback)

## 4. Server — Per-Page Streaming

- [x] 4.1 page-start with dev name (James/Kevin/Mia/Alex/Sophie/Leo)
- [x] 4.2 page-done with dev name
- [x] 4.3 page-error with retry message
- [x] 4.4 assembling phase event
- [x] 4.5 SSE heartbeat every 10-15s (prevents proxy/browser timeout)

## 5. Client — Per-Page Progress UI

- [x] 5.1 Per-page progress list with status icons
- [x] 5.2 ⏳ pending → 🔄 generating → ✅ done / ❌ error
- [x] 5.3 "X/Y 頁面完成" counter
- [x] 5.4 Dev names shown (pageDevNames state)

## 6. Server — Planning Pipeline

- [x] 6.1 4-agent discussion: Echo(PM) → Lisa(UX) → David(QA) → Bob(Tech Lead)
- [x] 6.2 Named agents with personalities and conversational style
- [x] 6.3 Skills injected into all planning agents (HPSkills + Superpowers)
- [x] 6.4 Tech Lead produces final JSON plan
- [x] 6.5 Design profile (project-level) read before parallel path
- [x] 6.6 Design direction passed to planAndReview

## 7. Server — buildLocalPlan Enhancement

- [x] 7.1 6 site type templates (shopping, travel, education, medical, saas, news, library)
- [x] 7.2 Detailed page specs with layout, components, onclick instructions
- [x] 7.3 30+ CSS utility classes added to sharedCss
- [x] 7.4 User message injected into every page spec

## 8. Post-Generation Quality

- [x] 8.1 fixNavigation: strip page- prefix, redirect broken targets
- [x] 8.2 QA strip: remove embedded nav/header/footer from page divs
- [x] 8.3 Thin page detection (<100 chars warning)
- [x] 8.4 Sub-agent no-nav rule (triple-emphasized)
- [x] 8.5 Sub-agent minimum 500 chars content requirement
- [x] 8.6 designSystemValidator auto-fix (white bg, shadows, fonts)
- [x] 8.7 Sidebar page tabs: postMessage + message listener for page switching

## 9. Skills & Knowledge

- [x] 9.1 Superpowers skills imported (14 skills from obra/superpowers)
- [x] 9.2 HPSkills imported (11 skills)
- [x] 9.3 Unified skill directory: D:\Projects\project-bridge\skill\
- [x] 9.4 All planning agents receive skills context

## 10. Remaining Issues

- [ ] 10.1 Thinking/Reasoning not always visible after page reload (closure issue partially fixed)
- [ ] 10.2 Sub-agent still sometimes generates nav inside page div despite rules
- [ ] 10.3 Some pages have thin content (need post-gen QA agent to re-generate)
- [ ] 10.4 Code editor not editable (read-only)
- [ ] 10.5 Post-generation code review agent (validate all pages have content + navigation works)
