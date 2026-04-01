## 1. Three-Layer Context Architecture

- [ ] 1.1 Define role keyword maps for each agent (Echo=業務/流程/需求, Lisa=設計/UX/介面, David=規則/驗證/測試, Bob=架構/技術/整合)
- [ ] 1.2 Implement `selectSkillsForRole(skills, role)` — filter + rank by keyword overlap, return top 3 truncated to 400 chars
- [ ] 1.3 Refactor `plannerAgent.ts` — replace flat `skillsContext` with L1 (project meta) + L2 (role-filtered skills) + L3 (lessons)
- [ ] 1.4 Add skeptical reminder at end of every L2 block: "skills 僅供參考，與使用者需求矛盾時以使用者為準"

## 2. Session Lessons

- [ ] 2.1 Create migration `xxx_project_lessons.sql` — id, project_id (FK CASCADE), lesson, source, created_at
- [ ] 2.2 In `parallelGenerator.ts` — after QA report, extract critical issues and INSERT into project_lessons
- [ ] 2.3 Create `getLessons(projectId)` function — SELECT recent 10, DELETE expired (>30 days)
- [ ] 2.4 In `plannerAgent.ts` — accept lessons parameter, inject as Layer 3 【上次生成教訓】
- [ ] 2.5 In `chat.ts` — load lessons and pass to planAndReview + buildLocalPlan
- [ ] 2.6 In `masterAgent.ts` buildLocalPlan — inject page-specific lessons into page specs

## 3. Pre-Assembly Gate

- [ ] 3.1 Create `validateFragment(html, pageName)` function — checks page wrapper, text >50 chars, div balance ±2, no DOCTYPE
- [ ] 3.2 In `parallelGenerator.ts` — call validateFragment immediately after generatePageFragment returns success
- [ ] 3.3 If gate fails → immediate retry with different key (max 1 gate-retry per page)
- [ ] 3.4 Log gate results: page name, pass/fail, reason, text length, div balance
- [ ] 3.5 Remove or reduce the batch retry phase (Step 2.5) since gate-retry handles it earlier

## 4. Testing

- [ ] 4.1 Unit test: selectSkillsForRole — verify Echo gets business skills, Lisa gets design skills
- [ ] 4.2 Unit test: validateFragment — valid HTML passes, empty/unbalanced/DOCTYPE fails
- [ ] 4.3 Unit test: lessons CRUD — insert, read with limit, auto-expire
