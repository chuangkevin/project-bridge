## 1. High-Fidelity Spec Review

- [x] 1.1 Add a raw-text-first spec review service that preserves API contracts and business rules
- [x] 1.2 Support multi-document source-of-truth ranking and diff detection
- [x] 1.3 Include self-verification output for supported vs uncertain claims

## 2. Consultant Mode Routing

- [x] 2.1 Add consultant sub-modes: `spec-review`, `architecture-review`, `ux-review`, `general`
- [x] 2.2 Inject mode-specific instructions before QA responses
- [x] 2.3 Prefer high-fidelity review blocks over lossy page-only summaries when docs are attached

## 3. Design Mode Checklist

- [x] 3.1 Emit todo/checklist SSE events after planning completes
- [x] 3.2 Update checklist status during skill conflict checks, page generation, and validation
- [x] 3.3 Render checklist in the design-mode progress UI

## 4. Documentation

- [x] 4.1 Update README feature list
- [x] 4.2 Update repo CLAUDE guidance
- [x] 4.3 Update memory notes for future sessions

## 5. Verification

- [x] 5.1 Build server package
- [x] 5.2 Build client package
