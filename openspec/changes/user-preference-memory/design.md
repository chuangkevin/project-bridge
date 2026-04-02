## Context

Project Bridge is an AI-driven prototype generation tool using React + Express + SQLite + Gemini API. The system already has a `user_preferences` table (migration 025) with a simple key-value store per user, and a `/api/users/preferences/:key` API for manual get/put. The generation pipeline uses a master agent (plans multi-page layout) and sub-agents (generate individual page HTML), with skills injected into system prompts. Micro-adjust and variant selection flows also exist.

Existing architecture:
- Prompt files: `server/src/prompts/system.txt`, `micro-adjust.txt`, `vision-micro-adjust.txt`, `element-adjust.txt`
- Agent chain: `masterAgent.ts` (planning) -> `subAgent.ts` (page generation) -> `htmlAssembler.ts`
- Chat route: `routes/chat.ts` — builds effective system prompt, injects skills, handles variant selection
- Preferences: `routes/preferences.ts` — simple CRUD on `user_preferences` table
- Micro-adjust: handled in chat route with specific prompt templates

## Goals / Non-Goals

**Goals:**
- Automatically learn user preferences from observed behavior (zero-effort for user)
- Inject learned preferences into generation prompts to improve first-generation quality
- Support cross-project preferences (per-user, not per-project)
- Keep confidence scores so weak signals don't override strong ones
- Real-time preference updates after each user action (no background jobs)

**Non-Goals:**
- No autoDream-style background consolidation process (too complex for current scope)
- No preference management UI (users don't manually edit learned preferences)
- No per-project preference overrides (all preferences are global per-user)
- No preference export/import
- No preference decay over time (confidence only increases or gets replaced)

## Decisions

### D1: Extend existing `user_preferences` table vs. new table

**Choice**: Extend the existing `user_preferences` table with `confidence` (REAL, 0.0-1.0) and `source` (TEXT) columns.

**Alternative**: Create a separate `learned_preferences` table.

**Rationale**: The existing table already has the right shape (user_id, key, value). Adding metadata columns avoids schema duplication and lets the existing manual preference API coexist with learned preferences. The `source` column distinguishes manual (`manual`) from learned (`observed`) preferences.

**Implementation**: Migration adds `confidence REAL DEFAULT 1.0` and `source TEXT DEFAULT 'manual'` to `user_preferences`. Existing rows (manual preferences) keep confidence=1.0 and source='manual'.

### D2: What to track — preference categories

**Choice**: Track four categories of preferences, each with a specific key pattern:

| Category | Key Pattern | Example Value | Observation Trigger |
|---|---|---|---|
| Design style | `pref:design_style` | `"dark"`, `"minimalist"`, `"colorful"` | Variant selection patterns |
| Color preferences | `pref:color:{element}` | `"#1a1a2e"` | Repeated micro-adjust color changes |
| Common pages | `pref:common_pages` | `["login","dashboard","settings"]` | Page request frequency across projects |
| Mode usage | `pref:mode` | `"consultant"` | Mode selection frequency |

**Rationale**: These four categories cover the most impactful generation parameters. Key prefix `pref:` distinguishes learned preferences from UI state preferences.

### D3: Confidence scoring mechanism

**Choice**: Simple frequency-based confidence. Confidence increases by 0.2 per consistent observation (capped at 1.0). If a conflicting observation arrives, confidence resets to 0.3 with the new value.

**Alternative**: Bayesian inference, exponential moving average.

**Rationale**: Simple and predictable. A user needs ~4 consistent actions to reach high confidence (0.8+). The reset on conflict ensures the system adapts to changing tastes rather than being locked in.

### D4: Injection strategy — where in the prompt

**Choice**: Inject preferences as a dedicated `USER PREFERENCES` block at the end of system prompts (after skills, before user message). Only inject preferences with confidence >= 0.6.

**Alternative**: Inject into project context, or into each prompt section individually.

**Rationale**: A single block is easy to manage and debug. The 0.6 threshold means a preference needs at least 3 consistent observations before it influences generation. Placing it after skills ensures skills (explicit knowledge) take priority over learned preferences.

**Injection format**:
```
=== USER PREFERENCES (learned from past behavior) ===
- Design style: dark, minimalist (confidence: 0.8)
- Preferred primary color: #1a1a2e (confidence: 0.6)
- Frequently requested pages: login, dashboard (confidence: 1.0)
Apply these as defaults unless the user's current request explicitly contradicts them.
===================================================
```

### D5: Where to hook observation — event points

**Choice**: Hook into three existing endpoints/flows:

1. **Variant selection** (when user picks a generated variant): Extract design style signals from the chosen variant's characteristics.
2. **Micro-adjust** (when user changes element properties): Track repeated color/style changes.
3. **Chat message** (when user sends a generation request): Extract page name patterns from the message text.

**Rationale**: These are the three highest-signal user actions. Mode usage is already tracked by the existing preferences system and doesn't need passive learning.

## Database Changes

### Modify table: user_preferences

```sql
ALTER TABLE user_preferences ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0;
ALTER TABLE user_preferences ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
```

Existing rows will get `confidence = 1.0` and `source = 'manual'` by default, preserving backward compatibility.

## Risks / Trade-offs

- **[Incorrect preference learning]** → Mitigated by confidence threshold (0.6) for injection. Low-confidence preferences are stored but not used. Reset mechanism handles changing tastes.
- **[Prompt length increase]** → Preferences block is small (~200 tokens). Negligible compared to skills injection.
- **[Privacy]** → Preferences are per-user and only visible to that user's generation pipeline. No cross-user data sharing.
- **[Migration on existing data]** → Adding columns with defaults is safe. Existing manual preferences continue to work unchanged.

## Open Questions

- Should there be a way for users to clear learned preferences? (Deferred — add later if requested)
- Should preference confidence decay over time if not reinforced? (Deferred — start without decay)
