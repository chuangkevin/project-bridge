## ADDED Requirements

### Requirement: Chat textarea accepts pasted clipboard images via Ctrl+V

The chat textarea area SHALL intercept `paste` events containing image data. When an image is detected in `clipboardData.items`, the system SHALL convert it to a File object and upload it via the existing `uploadFile()` flow. The resulting attached file SHALL be marked with `isClipboardImage: true` to distinguish it from design-spec document uploads.

#### Scenario: User pastes screenshot into chat
- **WHEN** the user presses Ctrl+V while the chat textarea is focused and the clipboard contains an image
- **THEN** the image is uploaded to the server and appears as an attached file chip with a thumbnail preview
- **AND** the `isClipboardImage` flag is set to `true` on the attached file entry

#### Scenario: User pastes text (not image) into chat
- **WHEN** the user presses Ctrl+V with text-only clipboard content
- **THEN** the default paste behavior occurs (text is inserted into the textarea)
- **AND** no upload is triggered

#### Scenario: Upload error during paste
- **WHEN** the pasted image upload fails
- **THEN** an error message is displayed
- **AND** no file chip is added

### Requirement: Image thumbnail displayed in user message bubble

When a user sends a message that includes an attached clipboard image, the user message bubble SHALL display a thumbnail of the image (max 120px width) above the message text. The `ChatMessage` interface SHALL support an optional `imageUrl` field for this purpose.

#### Scenario: Message with image shows thumbnail
- **WHEN** a user message is displayed that has an associated `imageUrl`
- **THEN** a thumbnail image is rendered above the message text in the user bubble
- **AND** the thumbnail has a maximum width of 120px with rounded corners

#### Scenario: Message without image shows text only
- **WHEN** a user message has no `imageUrl`
- **THEN** the message bubble displays only the text content (no change from current behavior)

### Requirement: Clipboard image files skip design-spec analysis pipeline

Files marked with `isClipboardImage: true` SHALL NOT trigger the visual analysis pipeline (art-style extraction, design-spec analysis). They are uploaded and stored for the vision-micro-adjust flow only.

#### Scenario: Clipboard image skips analysis
- **WHEN** a file is uploaded with `isClipboardImage: true`
- **THEN** the server stores the file but does not queue it for visual analysis or art-style extraction
- **AND** the file chip does not show "analyzing..." status

## MODIFIED Requirements

### Requirement: UploadedFile interface extended with clipboard image flag

The existing `UploadedFile` interface SHALL be extended with an optional `isClipboardImage?: boolean` field. The file upload response SHALL include this flag when the upload request indicates a clipboard image source.

#### Scenario: Upload response includes clipboard flag
- **WHEN** a file is uploaded with `isClipboardImage: true` in the form data
- **THEN** the server response includes `isClipboardImage: true`
- **AND** the attached file entry in the client state reflects this flag
