## ADDED Requirements

### Requirement: Sub-agent receives relevant skills in prompt
The `generatePageFragment()` function SHALL accept an optional `skills` parameter. When provided, skill content SHALL be injected into the sub-agent's system prompt under a `BUSINESS RULES` section.

#### Scenario: Skills provided for a page
- **WHEN** `generatePageFragment` is called with `skills: [{ name: '會員系統', content: '所有操作需登入...' }]`
- **THEN** the sub-agent's system prompt includes `BUSINESS RULES (from project knowledge base):\n【會員系統】所有操作需登入...`

#### Scenario: No skills provided
- **WHEN** `generatePageFragment` is called with `skills: []` or `skills: undefined`
- **THEN** the sub-agent's system prompt does not include a BUSINESS RULES section

### Requirement: Skill injection is limited per sub-agent
Each sub-agent SHALL receive at most 3 skills, each truncated to 500 characters of content. Skills SHALL be selected by keyword relevance to the page name and spec.

#### Scenario: Many skills available
- **WHEN** project has 10 active skills AND page name is "購物車"
- **THEN** system selects the 3 most relevant skills (e.g., "購物流程", "付款規則", "庫存管理") based on keyword overlap with page name and spec text

#### Scenario: Skill content exceeds limit
- **WHEN** a skill's content is 2000 characters
- **THEN** only the first 500 characters are injected, followed by "..."

### Requirement: parallelGenerator passes skills to sub-agents
The `generateParallel()` function SHALL load active skills for the project and pass relevant subsets to each `generatePageFragment()` call.

#### Scenario: Parallel generation with skills
- **WHEN** `generateParallel` is called for a project with active skills
- **THEN** each sub-agent receives a filtered subset of skills relevant to its assigned page

#### Scenario: Project has no skills
- **WHEN** `generateParallel` is called for a project with no active skills
- **THEN** sub-agents are called without skills parameter (no change from current behavior)
