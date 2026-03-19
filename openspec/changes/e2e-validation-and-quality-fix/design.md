## Context

The Document Analysis Agent is built and committed (5 commits). It correctly classifies documents (95% accuracy), extracts structured pages/components/rules, and runs agent skills (explore, UX review, design proposal). However, the generation end has two verified bugs:

1. **Dual `<style>` tags**: Gemini outputs two `<style>` blocks — one in `<head>`, one in `<body>`. The second overwrites CSS custom properties, causing `--c-purple-600` to resolve as empty.
2. **Color convention ignored**: Despite `system.txt` having color rules, the AI still uses default blue `#3b82f6` instead of convention purple `#8E6FA7`. The `getComputedStyle` test confirmed `var(--primary)` resolves to blue, not purple.

Current flow: `upload → agent analyzes → chat.ts assembles prompt → Gemini generates HTML → store as prototype`. The prompt assembly and HTML storage happen without any post-processing or validation.

## Goals / Non-Goals

**Goals:**
- Fix the color and dual-style-tag bugs so generated prototypes actually use HousePrice purple
- Add HTML post-processing to catch and fix common AI output issues
- Validate each fix with Playwright before committing (test-then-commit discipline)
- Full E2E validation: upload real PDF → analyze → generate → visual verification

**Non-Goals:**
- Redesigning the agent pipeline (already works well)
- Changing the Gemini model or prompt architecture
- Mobile-specific layout fixes (separate change)
- Performance optimization of agent skills

## Decisions

### Decision 1: HTML Sanitizer as post-processing step in chat.ts

**Choice**: Add a `sanitizeHtml()` function in chat.ts that runs after AI response, before storing prototype.

**Rationale**: The AI sometimes produces invalid HTML (dual style tags, missing closing tags, truncated scripts). Instead of trying to make the AI never make mistakes (unreliable), we fix the output programmatically.

**What it does**:
- Merge multiple `<style>` blocks into one (concatenate content, keep in `<head>`)
- Ensure `</script>` and `</html>` exist (detect truncation)
- Validate `showPage` function exists for multi-page prototypes

**Alternative considered**: More aggressive prompt engineering → rejected because AI behavior is non-deterministic; post-processing is deterministic.

### Decision 2: Color convention injection as CSS override

**Choice**: After sanitization, inject a `<style>` override block at the end of `<head>` that force-sets `:root { --primary: #8E6FA7 }` from the convention.

**Rationale**: Even with prompt rules, Gemini sometimes uses wrong colors. A CSS override is 100% reliable — it doesn't depend on AI compliance. The convention colors are already in the DB/file, so we just inject them.

**Alternative considered**: Only rely on prompt rules → rejected because testing showed AI still uses blue 50% of the time.

### Decision 3: Test-then-commit workflow with 4 phases

**Choice**: Split work into 4 phases, each with its own test + commit:
1. HTML sanitizer + test
2. Color override injection + test
3. Generation quality validator + test
4. Full E2E validation + cleanup + test

**Rationale**: User explicitly requested "每完成一個階段就測試並 commit". This also makes rollback granular.

## Risks / Trade-offs

- **[Risk] CSS override may conflict with design profile tokens** → Mitigation: only inject convention colors when `design_convention` exists in DB; design profile tokens take precedence if explicitly set
- **[Risk] HTML sanitizer may break valid AI output** → Mitigation: sanitizer only acts on known patterns (dual style, missing close tags); doesn't modify content
- **[Risk] Rate limit during E2E tests** → Mitigation: reuse analysis results from DB when possible; skip generation tests gracefully on 429

## Open Questions

- Should the sanitizer also fix inline `style` attributes that use wrong colors? (Probably not — too aggressive)
