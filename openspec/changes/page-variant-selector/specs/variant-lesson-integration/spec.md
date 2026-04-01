## ADDED Requirements

### Requirement: Variant prompts include lesson context
When generating variants for a page that has QA lessons, the variant prompt SHALL include the lesson as negative guidance: "上次這頁的問題是 XX，請用不同方式避免這個問題。"

#### Scenario: Lesson about empty page
- **WHEN** lesson says "物件詳情: 頁面內容不足"
- **THEN** variant prompts include "上次這頁內容不足，請確保有豐富的元件和文字內容（至少 500 chars）"

#### Scenario: Lesson about broken layout
- **WHEN** lesson says "聯絡頁: div imbalance"
- **THEN** variant prompts include "上次這頁 div 結構不正確，請確保所有 div 正確關閉"

### Requirement: Selected variant clears related lessons
After a user selects a variant and the page is successfully replaced, the system SHALL mark related lessons as resolved (or delete them) so they don't trigger variants again next time.

#### Scenario: Lesson cleared after selection
- **WHEN** user selects a variant for "物件詳情" AND lesson "物件詳情: 頁面內容不足" exists
- **THEN** that lesson is deleted from project_lessons table

#### Scenario: Unrelated lessons preserved
- **WHEN** user selects a variant for "物件詳情" AND lesson "首頁: cards-no-navigation" exists
- **THEN** the 首頁 lesson is NOT deleted
