## ADDED Requirements

### Requirement: QA failures are stored as project lessons
After each generation, the system SHALL extract critical issues from the QA report and store them in a `project_lessons` DB table. Each lesson includes the page name, issue description, and source.

#### Scenario: QA finds empty page
- **WHEN** QA report contains `{ severity: 'critical', page: '物件詳情', rule: 'empty-page' }`
- **THEN** a lesson is stored: `{ project_id, lesson: '物件詳情: 頁面內容不足', source: 'qa-report' }`

#### Scenario: No QA issues
- **WHEN** QA report has 0 critical issues
- **THEN** no lessons are stored for this generation

### Requirement: Lessons injected into next generation as Layer 3
When generating for a project that has stored lessons, the system SHALL inject the most recent 10 lessons into agent prompts as Layer 3 (【上次生成教訓】section).

#### Scenario: Second generation with lessons
- **WHEN** project has 3 stored lessons from previous generation
- **THEN** each agent's prompt includes those 3 lessons in Layer 3
- **AND** buildLocalPlan's page specs include relevant lessons per page

#### Scenario: First generation (no lessons)
- **WHEN** project has 0 stored lessons
- **THEN** Layer 3 is omitted from prompts

### Requirement: Lessons auto-expire after 30 days
Lessons older than 30 days SHALL be automatically deleted when the lesson table is queried.

#### Scenario: Old lesson cleanup
- **WHEN** system queries lessons AND some are older than 30 days
- **THEN** old lessons are deleted before returning results

### Requirement: Lessons table migration
A new migration SHALL create the `project_lessons` table with columns: id, project_id, lesson, source, created_at. Foreign key to projects with CASCADE delete.

#### Scenario: Migration runs
- **WHEN** server starts
- **THEN** `project_lessons` table exists with correct schema
