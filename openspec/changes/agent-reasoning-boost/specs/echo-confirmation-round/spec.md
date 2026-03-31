## ADDED Requirements

### Requirement: Echo does a confirmation round after all agents
After Bob (Tech Lead) completes his summary, Echo (PM) SHALL do one additional round reviewing ALL agent outputs. Echo's confirmation prompt focuses on: missing pages, navigation gaps, unresolved disagreements between agents, and final page list confirmation.

#### Scenario: Echo catches missing page
- **WHEN** Lisa proposed 5 pages but Bob's summary only mentions 4
- **THEN** Echo's confirmation round flags the discrepancy and confirms the correct page list

#### Scenario: Echo confirms complete plan
- **WHEN** all agents agree and no gaps are found
- **THEN** Echo's output says "方案完整，開始執行" with the final confirmed page list

#### Scenario: Echo resolves disagreement
- **WHEN** Lisa says "需要 6 個頁面" but David says "太多了，4 個就夠"
- **THEN** Echo makes the final call with reasoning (e.g., "採用 Lisa 的 6 頁方案，因為用戶需求明確要求...")

### Requirement: Confirmation round streamed to user
Echo's confirmation round SHALL be streamed via SSE just like the other agents, with the same format: emoji + name + role prefix.

#### Scenario: User sees confirmation
- **WHEN** Echo does the confirmation round
- **THEN** user sees "👩‍💼 **Echo**（產品經理・最終確認）：" followed by the confirmation text
