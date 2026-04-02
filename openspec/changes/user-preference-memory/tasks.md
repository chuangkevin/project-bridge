## 1. Database migration

- [ ] 1.1 Create migration `032_preference_learning.sql`: ALTER `user_preferences` to add `confidence REAL NOT NULL DEFAULT 1.0` and `source TEXT NOT NULL DEFAULT 'manual'`
- [ ] 1.2 Verify migration runs cleanly on existing data (existing rows get confidence=1.0, source='manual')

## 2. PreferenceTracker service (preference-tracking)

- [ ] 2.1 Create `services/preferenceTracker.ts` with `PreferenceTracker` class
- [ ] 2.2 Implement `onVariantSelected(userId, variantHtml)`: analyze variant HTML to extract design style signals (dark/light, minimal/rich, color palette), upsert `pref:design_style`
- [ ] 2.3 Implement `onMicroAdjust(userId, elementType, property, value)`: track color property changes, upsert `pref:color:{elementType}` when color properties are changed
- [ ] 2.4 Implement `onChatMessage(userId, message)`: extract page name mentions (login, dashboard, settings, contact, profile, etc.), update `pref:common_pages` frequency list
- [ ] 2.5 Implement confidence scoring: +0.2 for consistent observation (cap 1.0), reset to 0.3 on conflicting value
- [ ] 2.6 Implement `getHighConfidencePreferences(userId)`: query preferences with `source='observed'` and `confidence >= 0.6`, return formatted array

## 3. Observation hooks (preference-tracking)

- [ ] 3.1 Hook `PreferenceTracker.onVariantSelected()` into variant selection flow in `routes/chat.ts` (fire-and-forget, no await)
- [ ] 3.2 Hook `PreferenceTracker.onMicroAdjust()` into micro-adjust flow in `routes/chat.ts` (fire-and-forget, no await)
- [ ] 3.3 Hook `PreferenceTracker.onChatMessage()` into chat generation flow in `routes/chat.ts` (fire-and-forget, no await)

## 4. Preference formatting and injection (preference-injection)

- [ ] 4.1 Implement `formatPreferencesBlock(preferences)`: convert preference rows into the human-readable `USER PREFERENCES` prompt block
- [ ] 4.2 Inject preference block into system prompt in `routes/chat.ts` — append after skills block, before user message, for single-page generation path
- [ ] 4.3 Add `userPreferences` parameter to `planGeneration()` in `services/masterAgent.ts` — include in master agent prompt after design convention section
- [ ] 4.4 Add `userPreferences` parameter to `generatePageFragment()` in `services/subAgent.ts` — include in sub-agent system prompt
- [ ] 4.5 Include preference context in micro-adjust prompt building (in chat route micro-adjust handler)
- [ ] 4.6 Update all call sites of `planGeneration()` and `generatePageFragment()` to pass the formatted preferences string

## 5. Testing

- [ ] 5.1 Unit test `PreferenceTracker` confidence scoring: consistent observations increase confidence, conflicting observations reset
- [ ] 5.2 Unit test `formatPreferencesBlock()`: correct formatting for each preference type
- [ ] 5.3 Unit test `getHighConfidencePreferences()`: only returns confidence >= 0.6, only source='observed'
- [ ] 5.4 Integration test: variant selection triggers preference tracking without delaying response
- [ ] 5.5 Integration test: micro-adjust triggers preference tracking without delaying response
- [ ] 5.6 Integration test: preferences appear in generated system prompt when confidence is high enough
- [ ] 5.7 Integration test: preferences do NOT appear in prompt when confidence < 0.6
