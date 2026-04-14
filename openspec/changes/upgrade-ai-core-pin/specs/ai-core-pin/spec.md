## ADDED Requirements

### Requirement: project-bridge MUST keep its ai-core pin aligned to a verified shared-library commit
When `project-bridge` consumes `@kevinsisi/ai-core` through a git URL, the pinned commit SHALL be updated deliberately and validated before deployment.

#### Scenario: Shared ai-core commit is upgraded
- **WHEN** `project-bridge` updates its `@kevinsisi/ai-core` dependency pin
- **THEN** both `package.json` and lockfile tarball references point to the same verified commit
- **AND** the upgraded app is validated through live deployment and web E2E verification
