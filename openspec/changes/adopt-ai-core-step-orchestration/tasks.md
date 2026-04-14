## 1. Dependency

- [x] 1.1 Update `@kevinsisi/ai-core` to a commit/version that includes `step-orchestration`

## 2. Lease Heartbeat Adoption

- [x] 2.1 Replace local `startLeaseHeartbeat` in `geminiRetry.ts` with ai-core `LeaseHeartbeat`
- [x] 2.2 Keep existing retry / cooldown / fallback behavior unchanged apart from the heartbeat source

## 3. StepRunner Adoption

- [x] 3.1 Refactor `documentAnalysisAgent.ts` Step 4 skill execution to use ai-core `StepRunner`
- [x] 3.2 Preserve the existing result shape (`explore`, `uxReview`, `designProposal`, `businessContext`)
- [x] 3.3 Keep project-specific prompts and skill functions in `project-bridge`

## 4. Verification

- [x] 4.1 Run the relevant server build command
- [x] 4.2 Review the diff for architecture boundary correctness
