## Why

The Document Analysis Agent and generation pipeline were built but never validated end-to-end in the real app. Key issues remain: the generation AI ignores the HousePrice purple color convention (#8E6FA7), produces duplicate `<style>` blocks causing CSS variable failures, and the full upload→analyze→generate flow hasn't been tested through the UI. Without validation, we can't confirm the agent actually improves prototype quality.

## What Changes

- Fix generation AI producing duplicate `<style>` tags (CSS variables defined but never applied)
- Fix color convention not being respected (AI defaults to blue #3b82f6 even when convention specifies purple #8E6FA7)
- Validate full pipeline through real app: upload PDF → agent analyzes → chat generates → prototype matches spec
- Add post-processing to sanitize AI HTML output (strip duplicate style blocks, validate structure)
- Clean up test artifacts and add `.gitignore` entries
- Each phase is tested with Playwright and committed independently

## Capabilities

### New Capabilities
- `html-output-sanitizer`: Post-process AI-generated HTML to fix common issues (duplicate style tags, incomplete scripts, missing closing tags) before storing as prototype version
- `generation-quality-validator`: Automated checks that verify generated prototypes match the analysis result (correct pages, components present, colors match convention)

### Modified Capabilities
- `css-variable-extraction`: Ensure extracted CSS variables reflect convention colors, not AI defaults

## Impact

- `packages/server/src/routes/chat.ts` — add HTML sanitization after AI response
- `packages/server/src/prompts/system.txt` — further strengthen color/style rules
- `packages/e2e/tests/` — new validation tests
- `.gitignore` — exclude test artifacts, traineddata files
