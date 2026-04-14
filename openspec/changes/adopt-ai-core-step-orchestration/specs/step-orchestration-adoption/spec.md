## ADDED Requirements

### Requirement: project-bridge SHALL adopt ai-core step orchestration for reusable multi-step Gemini flow handling
`project-bridge` SHALL prefer ai-core step-orchestration primitives for generic quota-sensitive Gemini step execution instead of keeping duplicate generic orchestration logic locally.

#### Scenario: lease heartbeat comes from ai-core
- **WHEN** `project-bridge` needs lease renewal for long-running Gemini calls
- **THEN** it SHALL use ai-core's reusable lease-heartbeat helper instead of maintaining a project-local heartbeat implementation

### Requirement: project-bridge SHALL keep domain-specific prompt and skill logic local
Adopting ai-core orchestration SHALL NOT move product-specific prompts, domain rules, or skill content into ai-core.

#### Scenario: skill steps still use project-bridge domain logic
- **WHEN** `documentAnalysisAgent` runs the Step 4 skills
- **THEN** the step execution primitive may come from ai-core
- **AND** the actual skill functions and prompts remain in `project-bridge`
