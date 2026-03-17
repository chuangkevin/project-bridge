## 1. Database

- [x] 1.1 Create migration 003_design_profile.sql: add design_profiles table (id, project_id UNIQUE, description, reference_analysis, tokens TEXT JSON, updated_at)

## 2. Backend — Design Profile API

- [x] 2.1 Implement GET `/api/projects/:id/design` — return design profile or `{ profile: null }`
- [x] 2.2 Implement PUT `/api/projects/:id/design` — upsert design profile (description, tokens, referenceAnalysis)
- [x] 2.3 Implement POST `/api/projects/:id/design/analyze-reference` — accept image upload (multer, max 10MB), send to gpt-4o vision as base64, return analysis text
- [x] 2.4 Wire design routes in index.ts

## 3. Backend — Prompt Injection

- [x] 3.1 In chat route: before calling OpenAI, fetch design profile for the project
- [x] 3.2 If design profile exists, append DESIGN PROFILE block to system prompt with description, reference analysis, and tokens
- [x] 3.3 Ensure behavior is unchanged when no design profile exists

## 4. Frontend — Design Tab

- [x] 4.1 Add "Chat" / "Design" tab switcher to the left panel
- [x] 4.2 Create DesignPanel component: fetch design profile on mount, show form
- [x] 4.3 Build description textarea in DesignPanel
- [x] 4.4 Build reference image upload: up to 5 images, show thumbnails, trigger Vision analysis on upload, display analysis text below each image
- [x] 4.5 Build design tokens form: primary color picker, secondary color picker, font family select, border radius slider (0-24px with live preview label), spacing radio (緊湊/正常/寬鬆), shadow radio (無/輕柔/明顯)
- [x] 4.6 Save button: PUT design profile, show toast "已儲存，下次生成將套用此設計"
- [x] 4.7 Add "Design Active" badge to toolbar when design profile is saved and non-empty

## 5. Playwright Testing

- [x] 5.1 API tests: GET design profile (null when empty, returns data when set)
- [x] 5.2 API tests: PUT design profile (upsert, returns saved data)
- [x] 5.3 API tests: POST analyze-reference (valid image returns analysis text, invalid returns error)
- [x] 5.4 E2E tests: switch to Design tab, fill description, save, see toast
- [x] 5.5 E2E tests: set design tokens, save, reload page, verify values restored
- [x] 5.6 E2E tests: toolbar shows "Design Active" badge after saving profile
