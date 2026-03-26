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

## 10. Known Bugs (Critical)

- [ ] 10.1 **空頁面** — 多頁生成後部分頁面看似空白（HTML 有內容但 CSS 沒套上或 display 沒切換）
- [ ] 10.2 **設計風格錯誤** — 設定「簡約蘋果風格」+藍色主色 但生成出來依然是 HousePrice 暖米色+紫色
- [ ] 10.3 **跑版** — 預約確認頁右側營業時間文字斷行擠壓、橘色色塊溢出
- [ ] 10.4 **Thinking 不顯示** — 重整頁面後 Reasoning 消失
- [ ] 10.5 Sub-agent 仍然在 page div 內生成 nav（導致 QA strip 後內容變少）
- [ ] 10.6 Post-generation code review agent 缺失（沒有最終品質驗證）
- [ ] 10.7 Code editor 不可編輯（read-only）
- [ ] 10.8 **project design_profiles 的 tokens 沒有替換 buildLocalPlan 的 sharedCss** — 只替換了 designConvention 文字但 CSS :root 變數還是 HousePrice 的
