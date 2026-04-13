## ADDED Requirements

### Requirement: Health endpoint MUST be reachable outside the API namespace
Project Bridge SHALL expose a non-SPA health endpoint at `/health` in addition to `/api/health`.

#### Scenario: Reverse proxy or external checker requests `/health`
- **WHEN** a client requests `/health`
- **THEN** the server returns backend health JSON
- **AND** the request is not handled by the SPA index fallback

#### Scenario: Existing API clients request `/api/health`
- **WHEN** a client requests `/api/health`
- **THEN** the server returns the same backend health JSON payload as `/health`
