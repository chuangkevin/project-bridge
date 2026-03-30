## ADDED Requirements

### Requirement: Conflict detection runs after plan, before generation
The system SHALL invoke a conflict detection step after `planAndReview()` completes and before `generateParallel()` starts. The step SHALL compare active Skill rules against the user's request and the plan output.

#### Scenario: Skills exist and plan is ready
- **WHEN** planAndReview completes with a valid plan AND the project has 1+ active skills
- **THEN** system calls `checkSkillConflicts(userMessage, plan, skills)` and waits for the result before proceeding to generation

#### Scenario: No active skills
- **WHEN** planAndReview completes AND the project has 0 active skills
- **THEN** system skips conflict detection and proceeds directly to generation

### Requirement: Conflict detection returns structured JSON
The system SHALL call Gemini AI with the user's request, plan pages/constraints, and all active skill contents. The AI MUST return JSON in the format: `{ conflicts: [{ rule: string, skillName: string, userIntent: string, severity: 'info' | 'warning' | 'critical', suggestion: string }] }`.

#### Scenario: Conflicting requirement detected
- **WHEN** user says "不需要登入功能" AND a skill states "所有操作需要身份驗證"
- **THEN** the AI returns a conflict with `severity: 'critical'`, `rule: '所有操作需要身份驗證'`, `userIntent: '不需要登入功能'`, and a `suggestion` explaining the discrepancy

#### Scenario: No conflicts found
- **WHEN** user's request is consistent with all skill rules
- **THEN** the AI returns `{ conflicts: [] }`

#### Scenario: AI call fails
- **WHEN** the Gemini API returns an error (429, timeout, etc.)
- **THEN** the system logs the error, skips conflict detection, and proceeds to generation without blocking

### Requirement: Conflicts streamed to frontend via SSE
The system SHALL send conflict results to the client as SSE events with type `conflict-report`. Each conflict SHALL be a separate SSE data payload.

#### Scenario: Conflicts found
- **WHEN** `checkSkillConflicts` returns 1+ conflicts
- **THEN** system sends `data: { type: 'conflict-report', conflicts: [...] }` via SSE before generation starts

#### Scenario: Critical conflict pauses generation
- **WHEN** conflict report contains 1+ conflicts with `severity: 'critical'`
- **THEN** system sends `data: { type: 'conflict-pause', message: '發現關鍵衝突，是否繼續？' }` and waits up to 30 seconds for a follow-up user message before auto-continuing

### Requirement: David QA Agent references Skill rules explicitly
The David (QA) agent prompt SHALL include an explicit instruction to compare the plan against Skill rules and flag any contradictions in its review output.

#### Scenario: David finds skill-related issue
- **WHEN** David's prompt includes skill content AND the plan contradicts a skill rule
- **THEN** David's output mentions the specific skill rule and the contradiction
