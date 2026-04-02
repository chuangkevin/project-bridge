## Why

Project Bridge generates prototypes based on user instructions, but treats every user identically. A user who always picks dark themes, always requests login pages, or always micro-adjusts button colors to a specific shade must repeat those preferences every time. This creates friction and lowers perceived generation quality. By passively observing user behavior patterns and feeding them back into the generation pipeline, we can produce prototypes that feel "personalized" from the first prompt.

## What Changes

- **Passive preference tracking**: The system observes user actions (variant selection, micro-adjust patterns, mode usage, page request patterns) and records derived preferences in `user_preferences` with confidence scores. No explicit "save my preference" UI needed.
- **Preference injection into prompts**: High-confidence preferences are automatically injected into agent system prompts (master agent, sub-agents, micro-adjust prompts), so generation reflects the user's established patterns without them needing to repeat instructions.

## Capabilities

### New Capabilities

- `preference-tracking`: Passive observation of user behavior — variant selection, micro-adjust patterns, mode usage, common page requests — and storage as key-value preferences with confidence scores.
- `preference-injection`: Automatic injection of high-confidence user preferences into all agent prompts (system prompt, master agent, sub-agent, micro-adjust), making generation output match user taste by default.

### Modified Capabilities

- Existing `user_preferences` table extended with `confidence` and `source` columns to support passive learning metadata.
- Chat route and sub-agent prompt builders modified to include preference context.

## Impact

- **Backend**: New `PreferenceTracker` service that hooks into variant selection, micro-adjust, and mode-switch endpoints. Migration to add `confidence` and `source` columns to `user_preferences`.
- **Prompt layer**: System prompt, master agent, sub-agent, and micro-adjust prompts gain a `USER PREFERENCES` block.
- **Database**: Extends existing `user_preferences` table (no new tables).
- **Frontend**: No UI changes — this is entirely backend/invisible. Preferences are learned silently and applied automatically.
- **Performance**: Minimal — one extra DB read per generation to load preferences; preference writes are fire-and-forget after user actions.
