## ADDED Requirements

### Requirement: Export to Figma button in workspace toolbar
The workspace SHALL display an "匯出 Figma" button in the toolbar area, visible when a prototype exists.

#### Scenario: Button visible when prototype exists
- **WHEN** project has generated HTML (currentHtml is not empty)
- **THEN** an "匯出 Figma" button SHALL be visible in the workspace toolbar

#### Scenario: Button hidden when no prototype
- **WHEN** project has no generated HTML
- **THEN** the export button SHALL NOT be displayed

### Requirement: Export dialog with quick export path
Clicking the export button SHALL open a dialog with a "快速匯出" section showing the share URL and step-by-step instructions.

#### Scenario: Copy share link
- **WHEN** user clicks "複製分享連結" in the quick export section
- **THEN** the prototype's public share URL SHALL be copied to clipboard
- **AND** a "已複製" confirmation SHALL appear

#### Scenario: Step-by-step instructions
- **WHEN** export dialog is open
- **THEN** the quick export section SHALL display instructions:
  1. 安裝 html.to.design Figma 插件
  2. 在 Figma 開啟插件
  3. 貼上連結
  4. 選擇 viewport 並匯入

### Requirement: Auto-generate share URL if missing
If the project does not have an accessible share URL, the system SHALL automatically ensure the share route is functional before displaying the URL.

#### Scenario: Share URL always available
- **WHEN** export dialog opens
- **THEN** the share URL (`/share/:token`) SHALL be pre-populated and functional
