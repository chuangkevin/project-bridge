## ADDED Requirements

### Requirement: Parse showPage calls and data-page attributes
The `validateNavigation()` function SHALL extract all `showPage('...')` and `showPage("...")` call targets from the HTML string. It SHALL also extract all `data-page="..."` attribute values. For each showPage call, the function SHALL determine the source page context (the `data-page` div that contains the call).

#### Scenario: Parse standard showPage calls
- **WHEN** the HTML contains `showPage('login')`, `showPage("dashboard")`, and `data-page="home"`, `data-page="login"`, `data-page="dashboard"`
- **THEN** the parser returns defined pages `['home', 'login', 'dashboard']` and navigation edges `[{from: 'home', to: 'login'}, {from: 'home', to: 'dashboard'}]` (assuming the calls are within the home page div)

#### Scenario: Handle dynamic showPage calls
- **WHEN** the HTML contains `showPage(targetVar)` (variable reference, not a string literal)
- **THEN** the parser flags this as an unresolved navigation call and does not report it as a missing target

### Requirement: Detect missing navigation targets
The function SHALL report a warning for every `showPage('X')` call where `X` does not match any `data-page="X"` attribute in the HTML.

#### Scenario: Missing target page detected
- **WHEN** the HTML has `showPage('settings')` but no `data-page="settings"` exists
- **THEN** the validation result includes a failed check with name `nav-missing-target` and detail mentioning "settings"

#### Scenario: All targets exist
- **WHEN** every showPage target has a matching data-page
- **THEN** the `nav-missing-target` check passes

### Requirement: Detect orphan pages
The function SHALL perform BFS from the entry page (first `data-page` in document order or the page shown on load) and report any `data-page` that is not reachable from the entry page as an orphan.

#### Scenario: Orphan page detected
- **WHEN** the HTML defines pages Home, Login, Dashboard, and Settings, but no page has `showPage('settings')`
- **THEN** the validation result includes a failed check with name `nav-orphan-pages` listing "Settings" as unreachable

#### Scenario: All pages reachable
- **WHEN** every defined page is reachable via showPage calls from the entry page
- **THEN** the `nav-orphan-pages` check passes

### Requirement: Detect dead-end pages
The function SHALL report pages that have no outgoing `showPage()` calls (no way to navigate away). The entry page is exempt if it is the only page. Pages with only a "back" or "home" navigation are NOT considered dead-ends.

#### Scenario: Dead-end page detected
- **WHEN** page "Profile" has no showPage calls inside its data-page div and is not the entry page
- **THEN** the validation result includes a warning check with name `nav-dead-ends` listing "Profile"

#### Scenario: Page with back navigation is not a dead-end
- **WHEN** page "Profile" has `showPage('home')` as its only outgoing navigation
- **THEN** "Profile" is NOT listed as a dead-end

### Requirement: Detect tab/state target mismatches
The function SHALL parse tab switching patterns (elements with `data-tab` or state toggle patterns) and verify that tab/state targets reference existing content sections.

#### Scenario: Tab target mismatch
- **WHEN** a tab element references `data-tab="premium"` but no content section with matching identifier exists
- **THEN** the validation result includes a warning with name `nav-tab-mismatch`

### Requirement: Return results in ValidationResult format
The `validateNavigation()` function SHALL return a `ValidationResult` object compatible with the existing validation pipeline. Each navigation issue SHALL be a separate check entry with `name`, `passed`, and `detail` fields. The function SHALL be called alongside `validatePrototype()` in the post-generation pipeline.

#### Scenario: Results integrated into validation pipeline
- **WHEN** prototype generation completes and `validateNavigation()` is called
- **THEN** the navigation checks appear alongside existing quality checks in the `ValidationResult` and are logged via `logValidation()`

### Requirement: Client displays navigation warnings
The client SHALL display navigation validation warnings as a badge on the prototype preview. Clicking the badge SHALL expand a panel showing each navigation issue with its detail text.

#### Scenario: Warning badge shows count
- **WHEN** navigation validation returns 3 warnings
- **THEN** a badge with "3" appears on the prototype preview area

#### Scenario: No warnings hides badge
- **WHEN** navigation validation returns zero warnings
- **THEN** no warning badge is displayed
