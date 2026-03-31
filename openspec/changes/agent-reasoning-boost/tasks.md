## 1. Structured Agent Prompts

- [ ] 1.1 Rewrite Echo (PM) prompt — chain-of-thought (觀察→分析→建議), add good/bad few-shot examples
- [ ] 1.2 Rewrite Lisa (UX) prompt — same structure, UX-specific examples
- [ ] 1.3 Rewrite David (QA) prompt — same structure, include explicit skill rule comparison
- [ ] 1.4 Rewrite Bob (Tech Lead) prompt — same structure, focus on integration and final decision

## 2. Conversation History Injection

- [ ] 2.1 Add `history` parameter to `planAndReview()` function signature
- [ ] 2.2 In chat.ts — pass last 5 conversation rounds to `planAndReview()`
- [ ] 2.3 In each agent prompt — prepend 【先前對話】section when history exists
- [ ] 2.4 Truncate history to max 2000 chars total to control token usage

## 3. Echo Confirmation Round

- [ ] 3.1 After Bob's output, add Echo confirmation call — review all agent outputs, check for gaps
- [ ] 3.2 Stream Echo confirmation to client with "👩‍💼 Echo（產品經理・最終確認）" prefix
- [ ] 3.3 Use Echo's confirmed page list as the final `finalPages` (override Bob's if different)

## 4. Plan Self-Verification

- [ ] 4.1 After `callAIJSON` produces plan, add verification call — check orphan pages, missing nav, empty specs
- [ ] 4.2 Verification uses JSON mode, returns corrected plan
- [ ] 4.3 Handle failure gracefully — log warning, use original plan
- [ ] 4.4 Log verification results (pages added/fixed/unchanged)

## 5. Scene Template Enhancement

- [ ] 5.1 Expand shopping template — add must-have components per page, standard nav rules
- [ ] 5.2 Expand travel template — same treatment
- [ ] 5.3 Expand education template — same treatment
- [ ] 5.4 Expand medical/saas/news templates — same treatment
- [ ] 5.5 Add new templates: restaurant (餐廳), portfolio (作品集), event (活動), real-estate (房屋)

## 6. Testing

- [ ] 6.1 Unit test: verify chain-of-thought structure in agent output (mock AI, check 觀察/分析/建議 sections)
- [ ] 6.2 Unit test: conversation history injection — verify history appears in prompt when provided, omitted when empty
- [ ] 6.3 Unit test: plan self-verification — mock plan with orphan page → verification fixes it
