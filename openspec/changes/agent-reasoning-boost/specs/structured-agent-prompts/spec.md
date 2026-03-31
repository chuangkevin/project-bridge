## ADDED Requirements

### Requirement: Agent prompts use chain-of-thought structure
Each agent (Echo, Lisa, David, Bob) prompt SHALL require the AI to respond in three sections: 【觀察】(observations from input), 【分析】(reasoning based on observations), 【建議】(concrete suggestions). This structure MUST be enforced in the system prompt.

#### Scenario: Echo analyzes a shopping site request
- **WHEN** Echo receives "我想做一個寵物用品購物網站"
- **THEN** Echo's output contains 【觀察】with key facts, 【分析】with domain reasoning, 【建議】with specific page/feature suggestions

#### Scenario: David reviews with skill rules
- **WHEN** David has skill rules about "所有操作需登入" AND plan has no login page
- **THEN** David's 【觀察】mentions the skill rule, 【分析】explains the conflict, 【建議】recommends adding login

### Requirement: Each agent prompt includes few-shot examples
Each agent's system prompt SHALL include one good example and one bad example of output. The good example demonstrates the chain-of-thought structure. The bad example shows a shallow, surface-level response to avoid.

#### Scenario: Lisa sees good and bad examples
- **WHEN** Lisa's prompt is constructed
- **THEN** it contains a ✅ good example (structured, deep analysis) and a ❌ bad example (shallow, obvious statements)

### Requirement: Conversation history injected into agent prompts
The `planAndReview` function SHALL accept conversation history (last 5 rounds) and inject it into each agent's prompt as 【先前對話】section. This provides context for follow-up conversations.

#### Scenario: Second conversation round
- **WHEN** user first said "做一個花店網站" (generated 5 pages) then says "加入會員系統"
- **THEN** each agent's prompt includes the prior exchange so they know a prototype already exists

#### Scenario: First conversation (no history)
- **WHEN** this is the first message in the project
- **THEN** 【先前對話】section is omitted from prompts
