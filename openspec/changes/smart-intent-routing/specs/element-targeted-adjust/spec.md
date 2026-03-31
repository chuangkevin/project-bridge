## ADDED Requirements

### Requirement: User can select an element in iframe for targeted adjustment
The system SHALL provide an "element select" interaction mode in the preview iframe. When active, clicking any element with a `data-bridge-id` attribute SHALL highlight it and store its bridgeId + outerHTML as the adjustment target.

#### Scenario: User clicks a card in element-select mode
- **WHEN** element-select mode is active AND user clicks on `<div data-bridge-id="product-card-1" class="card">...</div>`
- **THEN** the element is visually highlighted AND `targetBridgeId: "product-card-1"` and `targetHtml: "<div ...>...</div>"` are stored in client state

#### Scenario: User clicks outside any bridge element
- **WHEN** element-select mode is active AND user clicks on an element without data-bridge-id
- **THEN** selection is cleared, no target is set

#### Scenario: User can deselect
- **WHEN** an element is selected AND user clicks the same element or presses Escape
- **THEN** selection is cleared

### Requirement: Selected element context shown in chat input area
When an element is selected, the ChatPanel SHALL display a context bar above the input showing the selected element's tag name and bridge-id (e.g., "已選取：card [product-card-1]"). A dismiss button SHALL clear the selection.

#### Scenario: Element selected
- **WHEN** `targetBridgeId` is set to "product-card-1"
- **THEN** ChatPanel shows "🎯 已選取：product-card-1" above the input field with an X button

#### Scenario: User dismisses selection
- **WHEN** user clicks X on the context bar
- **THEN** `targetBridgeId` is cleared, context bar disappears

### Requirement: Chat API accepts targetBridgeId and targetHtml
The POST `/api/projects/:id/chat` endpoint SHALL accept optional `targetBridgeId` (string) and `targetHtml` (string) in the request body. When present, the server routes to element-targeted-adjust.

#### Scenario: Element-targeted request
- **WHEN** server receives `{ message: "加一個紅色 tag", targetBridgeId: "product-card-1", targetHtml: "<div class='card'>...</div>" }`
- **THEN** server uses element-adjust prompt with only the target HTML, not the full page

### Requirement: AI modifies only the targeted element
The element-targeted-adjust path SHALL send only the selected element's HTML to the AI (not the full prototype), along with the user's instruction. The AI returns the modified HTML fragment.

#### Scenario: Add tag to card
- **WHEN** target is `<div class="card"><h3>商品名</h3><p>NT$ 100</p></div>` AND instruction is "加一個紅色 tag 顯示「熱銷」"
- **THEN** AI returns `<div class="card"><span class="badge" style="background:var(--error);color:white;">熱銷</span><h3>商品名</h3><p>NT$ 100</p></div>`

#### Scenario: Change text color
- **WHEN** target is `<h1 style="color:var(--text)">標題</h1>` AND instruction is "改成紅色"
- **THEN** AI returns `<h1 style="color:var(--error)">標題</h1>`

### Requirement: Modified element replaces original in prototype HTML
After AI returns the modified fragment, the system SHALL replace the original element (matched by data-bridge-id) in the full prototype HTML and save as a new version.

#### Scenario: Successful replacement
- **WHEN** AI returns modified HTML for bridge-id "product-card-1"
- **THEN** the original element with `data-bridge-id="product-card-1"` in the prototype is replaced with the AI output
- **AND** the updated HTML is saved as a new prototype version

#### Scenario: Replacement fails div balance
- **WHEN** AI returns HTML with unbalanced divs
- **THEN** system attempts div balance fix before replacing. If still broken, returns error to user.

### Requirement: Toolbar has element-select mode toggle
The workspace toolbar SHALL have a clickable button (e.g., cursor icon) to toggle element-select mode. When active, the button is highlighted and the iframe cursor changes to crosshair.

#### Scenario: Toggle on
- **WHEN** user clicks the element-select button
- **THEN** iframe enters element-select mode, cursor becomes crosshair, button is highlighted

#### Scenario: Toggle off
- **WHEN** user clicks the button again or sends a chat message
- **THEN** element-select mode deactivates, cursor returns to normal
