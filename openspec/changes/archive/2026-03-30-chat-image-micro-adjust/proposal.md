## Why

Users often want to modify a specific part of the prototype to match a reference screenshot — for example, pasting a screenshot of a search box and saying "加上下拉選單". Currently, the chat input only accepts text, so users must describe visual changes verbally, which is imprecise and error-prone. There is no way to point at a visual element and say "make it look like this" or "add this feature to that element". Supporting image input in chat would let users communicate design intent far more precisely and enable targeted, element-level modifications.

## What Changes

- **Image paste/upload in chat**: The chat input gains support for pasting images from clipboard or attaching image files. Images are displayed as thumbnails in the message bubble
- **Gemini Vision element identification**: When a user sends an image + text, the system uses Gemini Vision API to analyze the screenshot and understand which UI element or area is being referenced. The Vision API response describes the element type, visual characteristics, and the user's intended modification
- **Element matching in current prototype**: The system compares the Vision API's element description against the current prototype HTML to identify the matching `data-bridge-id` element. Matching uses element type, text content, position hints, and class names
- **Targeted HTML/CSS patch generation**: Once the target element is identified, the system generates a CSS/HTML patch for only that element — not a full page regeneration. The patch is applied using the existing component swap mechanism
- **Image storage**: Uploaded chat images are stored in the project's upload directory and referenced in conversation history for context

## Capabilities

### New Capabilities
- `chat-image-input`: Chat panel accepts image paste (clipboard) and file attachment; images are uploaded to the server, stored in project uploads, and displayed as thumbnails in the conversation; conversation history includes image references for AI context
- `vision-element-identification`: Gemini Vision API analyzes user-provided screenshots to identify the UI element being referenced, its visual characteristics, and the intended modification; returns a structured description used for element matching
- `prototype-element-matching`: Given a Vision API element description and the current prototype HTML, the system identifies the closest matching `data-bridge-id` element using heuristics (element type, text content, CSS classes, DOM position); returns the bridge-id and element context for targeted patching

### Modified Capabilities
- `ai-chat-generation`: Chat route accepts multipart messages (text + images); when images are present, routes to the vision-based micro-adjust flow instead of text-only generation
- `component-regeneration`: Extended to accept vision-identified elements as targets, not just user-clicked bridge-ids; patch generation prompt includes the reference screenshot context

## Impact

- **Server**: Chat route updated to handle multipart/form-data with image uploads; new Vision API integration service for element analysis; new element-matching utility that parses prototype HTML and scores elements against Vision descriptions; image storage in project upload directory
- **Client**: ChatInput component gains paste handler (onPaste clipboard image detection) and file attachment button; image thumbnails rendered in message bubbles; loading state shows "analyzing image..." during Vision API call
- **AI prompts**: New Vision API prompt for element identification ("Describe the UI element in this screenshot: type, text content, visual style, position"); micro-adjust prompt extended to include reference image context
- **Dependencies**: Gemini Vision API (already available via existing Gemini integration); no new npm packages required
- **DB schema**: `conversations` table message content extended to support image references (JSON array of image URLs alongside text content)
