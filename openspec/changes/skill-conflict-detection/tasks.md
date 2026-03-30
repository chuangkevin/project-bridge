## 1. Skill Conflict Detection Service

- [ ] 1.1 Create `packages/server/src/services/skillConflictChecker.ts` — `checkSkillConflicts(userMessage, plan, skills)` function that calls Gemini JSON mode, returns `{ conflicts: [{ rule, skillName, userIntent, severity, suggestion }] }`
- [ ] 1.2 Handle AI failure gracefully — catch 429/timeout, return empty conflicts array, log warning
- [ ] 1.3 Write unit test for conflict checker — mock AI response, verify JSON parsing and error handling

## 2. Integrate into Generation Pipeline

- [ ] 2.1 In `packages/server/src/routes/chat.ts` — call `checkSkillConflicts()` after `planAndReview()` completes, before `generateParallel()`
- [ ] 2.2 Send conflict report via SSE: `data: { type: 'conflict-report', conflicts: [...] }`
- [ ] 2.3 For critical conflicts: send `{ type: 'conflict-pause' }` event, wait up to 30 seconds for user follow-up, then auto-continue

## 3. Strengthen David QA Agent

- [ ] 3.1 In `packages/server/src/services/plannerAgent.ts` — modify David's prompt to explicitly list Skill rules and require comparison against plan
- [ ] 3.2 David's output should mention specific skill name + rule when finding contradictions

## 4. Sub-Agent Skill Injection

- [ ] 4.1 Add `skills` parameter to `generatePageFragment()` in `packages/server/src/services/subAgent.ts`
- [ ] 4.2 Inject skills as `BUSINESS RULES` section in sub-agent system prompt, max 3 skills per page, each truncated to 500 chars
- [ ] 4.3 Implement keyword relevance matching — select top 3 skills by overlap between skill name/content keywords and page name/spec
- [ ] 4.4 In `packages/server/src/services/parallelGenerator.ts` — load active skills, filter per page, pass to `generatePageFragment()`

## 5. Frontend Display

- [ ] 5.1 In `packages/client/src/components/ChatPanel.tsx` — handle `conflict-report` SSE event, render conflict cards (yellow for warning, red for critical)
- [ ] 5.2 Handle `conflict-pause` event — show "繼續生成" / "修改需求" buttons
- [ ] 5.3 "繼續生成" sends a follow-up message to resume; "修改需求" focuses the input field

## 6. Testing

- [ ] 6.1 Unit test: `checkSkillConflicts` with mock skills and conflicting user intent → returns critical conflict
- [ ] 6.2 Unit test: no skills → returns empty conflicts, skips AI call
- [ ] 6.3 Unit test: sub-agent skill injection — verify prompt contains BUSINESS RULES section
- [ ] 6.4 Playwright E2E: trigger generation with skills, verify conflict-report SSE event in response stream
