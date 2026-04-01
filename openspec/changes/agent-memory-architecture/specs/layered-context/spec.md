## ADDED Requirements

### Requirement: Agent prompts use three-layer context injection
Each agent (Echo, Lisa, David, Bob) SHALL receive context in three layers instead of flat full-content injection. Layer 1 (project meta, <500 tokens) is always included. Layer 2 (role-relevant skills, <1500 tokens) is filtered per agent role. Layer 3 (historical lessons, <500 tokens) is included when available.

#### Scenario: Echo receives PM-relevant skills
- **WHEN** project has 20 skills including "business-member-doc" and "frontend-design-guide"
- **THEN** Echo's Layer 2 contains business/flow-related skills (e.g. "business-member-doc"), NOT design skills

#### Scenario: Lisa receives UX-relevant skills
- **WHEN** project has skills including "frontend-design-guide" and "business-order-quota-doc"
- **THEN** Lisa's Layer 2 contains "frontend-design-guide", NOT order/quota skills

#### Scenario: No skills available
- **WHEN** project has 0 active skills
- **THEN** Layer 2 is omitted from all agent prompts

### Requirement: Layer 2 skills filtered by agent role keywords
Each agent role SHALL have a keyword list for skill matching. Skills are ranked by keyword overlap with their name + description. Top 3 per agent, each truncated to 400 chars.

#### Scenario: David matches QA-related skills
- **WHEN** David's role keywords include "規則", "驗證", "流程", "會員", "權限"
- **THEN** skills with those keywords in name/description rank higher for David

### Requirement: Skills injection includes skeptical reminder
Every Layer 2 skills block SHALL end with a reminder that skills are hints, not mandates. Agent MUST explain in 【分析】if it chooses to override a skill rule based on user requirements.

#### Scenario: Skill says login required but user says no login
- **WHEN** skill contains "所有操作需登入" AND user says "不需要登入"
- **THEN** agent's 【分析】explicitly states "skill 要求登入，但使用者明確不需要，以使用者為準"
