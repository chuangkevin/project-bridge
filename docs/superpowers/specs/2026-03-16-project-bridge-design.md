# Project Bridge — Design Spec

## Overview

A web-based tool that lets PMs describe requirements (via natural language or uploaded documents), generates interactive HTML/CSS/JS prototypes using AI, and integrates with Gitea for project management — bridging the gap between PM specs and engineering implementation.

## Problem

Multi-role teams (PM, frontend, backend, design) waste significant time in back-and-forth communication. PMs write specs that engineers misinterpret. Static documents lack interactivity. There is no single source of truth that is both visual and actionable.

## Solution

PM uploads specs or describes requirements → AI generates a live, interactive HTML prototype → PM annotates specs and constraints on the prototype → specs are pushed to Gitea as issues → engineers see issue status reflected back on the prototype.

## Core User Flow

```
Phase 1:  PM describes requirements (text/Markdown)
            → AI (OpenAI API) generates HTML/CSS/JS
            → Sandboxed iframe preview
            → PM iterates via conversation
            → Share via unique link

Phase 2:  PM uploads spec files (PDF/PPT/Word/Image)
            → Text extraction + parsing → AI generates UI
            → PM adds annotations and spec details

Phase 3:  → One-click push to Gitea: create repo + create issues
            → Engineers develop on Gitea

Phase 4:  → Issue status syncs back to prototype UI
            → PM tracks progress + direct editing + behavior simulation
```

## Architecture

### Tech Stack

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| Frontend | React + TypeScript | Main UI, prototype preview (iframe), chat panel, direct editor, annotation/spec panel |
| Backend | Node.js + Express + TypeScript | API server, file parsing, AI stream proxy, Gitea API integration |
| Storage | SQLite + filesystem | Project data, generated HTML files |
| AI | OpenAI API (text, streaming) | Generate HTML/CSS/JS, conversational modifications |
| File Parsing | pdf-parse, mammoth, pptx-parser, Tesseract.js | Text extraction from various formats |
| Integration | Gitea REST API + Webhooks | Repo sync, issue management, status sync |

### System Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │Chat Panel│  │iframe Preview│  │Spec Panel │  │
│  │+ Upload  │  │(sandboxed)   │  │+ Annotate │  │
│  └────┬─────┘  └──────────────┘  └─────┬─────┘  │
│       │                                │         │
└───────┼────────────────────────────────┼─────────┘
        │            REST API            │
┌───────┼────────────────────────────────┼─────────┐
│       ▼         Express Backend        ▼         │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │File Parse│  │AI Stream     │  │Gitea      │  │
│  │Service   │  │Proxy         │  │Integration│  │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  │
│       │               │                │         │
│  ┌────▼─────┐  ┌──────▼───────┐  ┌─────▼─────┐  │
│  │SQLite +  │  │OpenAI API    │  │Gitea REST │  │
│  │Filesystem│  │              │  │API + Hook │  │
│  └──────────┘  └──────────────┘  └───────────┘  │
└──────────────────────────────────────────────────┘
```

## Frontend Pages

### 1. Home / Project List

- Project cards: name, preview thumbnail, last modified
- "New Project" button
- Gitea settings (server URL + API token) accessible from here

### 2. Project Workspace (Core Page)

- **Left panel**: Chat interface for natural language input + file upload area
- **Center**: Prototype preview in sandboxed iframe
- **Right panel**: Spec panel (click element to see specs) + annotation list
- **Top toolbar**: Share link, push to Gitea, toggle edit mode, device size selector

### 3. Share Preview Page

- Read-only mode, accessible via unique link
- Shows prototype + annotations + specs
- Displays Gitea issue status when bound (not started / in progress / done)

## File Parsing Strategy

All non-text files are parsed server-side to extract text content before sending to AI.

| Format | Method | Library |
|--------|--------|---------|
| PDF (.pdf) | Text extraction | pdf-parse |
| Word (.docx) | Text + structure extraction | mammoth |
| PowerPoint (.pptx) | Per-slide text extraction | pptx-parser |
| Markdown (.md) | Direct read | native |
| Images (.png/.jpg) | OCR text extraction | Tesseract.js |
| Plain text (.txt) | Direct use | — |

## AI Integration

- **Provider**: OpenAI API (text completion, streaming)
- **Generation**: PM's extracted text + conversation history → prompt → HTML/CSS/JS output
- **Modification**: Conversational edits sent as follow-up messages maintaining context
- **Output**: Single HTML file with inline CSS and JS (no framework dependencies). AI is instructed to assign stable `data-bridge-id` attributes to all interactive elements for annotation binding.
- **Streaming**: Server proxies OpenAI stream to frontend via SSE for real-time generation feedback
- **Structured constraints**: Device type, color scheme, and other options are injected into the system prompt
- **Context management**: Conversation history is sent with a sliding window (last 20 messages). Older messages are summarized. Token budget: ~80% for context, ~20% for generation.
- **Prompt strategy**: System prompt instructs the AI to (1) generate valid single-file HTML, (2) preserve existing `data-bridge-id` attributes on regeneration, (3) use semantic class names, (4) include inline comments for structure. The system prompt template is stored as a configurable file on the server.

## Annotation & Spec System

- **Annotations**: PM clicks on a UI element and adds a text note (e.g., "max 50 chars", "calls POST /api/users")
- **Spec panel**: Clicking an element shows its structured spec — field constraints, API endpoints, validation rules, business logic
- **Element binding**: Annotations bind to elements via `data-bridge-id` attributes (stable IDs generated by AI and preserved across regenerations). Fallback: if an element loses its ID after regeneration, the annotation stores a human-readable `label` and approximate position (x/y %) so it can be manually re-bound.
- **Visibility**: Annotations appear as small indicators on the prototype; hovering/clicking reveals details. The iframe communicates with the parent via `postMessage` to support click-to-select and indicator overlay.

## Gitea Integration

### Configuration

- Global settings page: Gitea server URL + personal access token
- Per-project binding: link a prototype project to a new or existing Gitea repo

### Repo Sync

- Generated HTML/CSS/JS files are committed and pushed to the bound Gitea repo
- Each AI generation/modification creates a new commit, providing version history
- Commit messages reference the conversation prompt that triggered the change
- Repo structure:
  ```
  /
  ├── prototype/
  │   └── index.html        # Current generated prototype
  ├── specs/
  │   └── annotations.json  # Exported annotations and spec data
  └── README.md             # Auto-generated project summary with link back to Project Bridge
  ```

### Issue Creation

- PM selects annotations/specs and creates Gitea issues with one click
- Issue contains: title, description, spec details, link back to prototype
- Bulk creation supported: select multiple specs → create multiple issues at once

### Webhook Lifecycle

- When a project is bound to a Gitea repo, the backend automatically registers a webhook via Gitea API (`POST /api/v1/repos/:owner/:repo/hooks`)
- Webhook secret is generated and stored in the `GiteaWebhook` table for payload verification
- When a project is unbound from a repo, the webhook is deleted via Gitea API
- Incoming webhook payloads are verified using HMAC signature before processing

### Status Sync Back

- Gitea webhook notifies the backend when issue status changes
- Prototype UI reflects development status per element:
  - 🔴 Not started (issue open, no assignee)
  - 🟡 In progress (issue assigned/in progress)
  - 🟢 Done (issue closed)
- PM can see overall project progress at a glance on the prototype

## API Endpoints

| Method | Path | Description | Phase |
|--------|------|-------------|-------|
| GET | `/api/projects` | List all projects | 1 |
| POST | `/api/projects` | Create new project | 1 |
| GET | `/api/projects/:id` | Get project detail | 1 |
| PUT | `/api/projects/:id` | Update project | 1 |
| DELETE | `/api/projects/:id` | Delete project | 1 |
| POST | `/api/projects/:id/chat` | Send message, returns SSE stream of AI response | 1 |
| GET | `/api/projects/:id/conversations` | Get conversation history | 1 |
| POST | `/api/projects/:id/upload` | Upload spec file, returns extracted text | 2 |
| GET | `/api/projects/:id/annotations` | List annotations | 2 |
| POST | `/api/projects/:id/annotations` | Create annotation | 2 |
| PUT | `/api/projects/:id/annotations/:aid` | Update annotation | 2 |
| DELETE | `/api/projects/:id/annotations/:aid` | Delete annotation | 2 |
| GET | `/api/settings` | Get global settings | 3 |
| PUT | `/api/settings` | Update settings (Gitea URL, token) | 3 |
| POST | `/api/projects/:id/gitea/bind` | Bind project to Gitea repo | 3 |
| DELETE | `/api/projects/:id/gitea/bind` | Unbind project from Gitea repo | 3 |
| POST | `/api/projects/:id/gitea/push` | Push current HTML to Gitea repo | 3 |
| POST | `/api/projects/:id/gitea/issues` | Create Gitea issues from annotations | 3 |
| POST | `/api/webhooks/gitea` | Receive Gitea webhook events | 4 |
| GET | `/api/share/:shareToken` | Get shared project (read-only) | 1 |

## Error Handling Strategy

- **AI errors** (rate limit, timeout, down): Show toast notification with retry button. Queue retries with exponential backoff (max 3 attempts).
- **Gitea unreachable**: Show connection error in Gitea panel. Operations fail gracefully with "Gitea unavailable" message. Prototype remains fully usable without Gitea.
- **File parsing failure**: Show specific error per file (e.g., "Could not extract text from this PDF"). Allow PM to continue with manual text input.
- **OCR slow/poor results**: Show warning "OCR results may be incomplete for this image type." Display extracted text for PM to review/edit before sending to AI.
- **General approach**: All errors surface as user-friendly toast notifications. No silent failures. Core prototype functionality (generate/edit/share) never depends on optional integrations (Gitea, file parsing).

## File Upload Limits

- Max file size: 20MB per file
- Max total per project: 100MB
- Allowed types: `.pdf`, `.docx`, `.pptx`, `.md`, `.txt`, `.png`, `.jpg`, `.jpeg`
- Image OCR note: Tesseract.js runs in a Node.js worker thread to avoid blocking. OCR is best suited for scanned text documents; results on diagrams/wireframes will be limited.

## Data Model

### Project

```
{
  id: string (uuid)
  name: string
  shareToken: string (for public link)
  giteaRepoUrl: string | null
  giteaRepoId: number | null
  createdAt: datetime
  updatedAt: datetime
}
```

### Conversation

```
{
  id: string (uuid)
  projectId: string (FK)
  role: "user" | "assistant"
  content: string
  attachments: string[] (file paths)
  generatedHtml: string | null
  createdAt: datetime
}
```

### UploadedFile

```
{
  id: string (uuid)
  projectId: string (FK)
  conversationId: string (FK)
  originalName: string
  mimeType: string
  fileSize: number (bytes)
  storagePath: string
  extractedText: string | null
  createdAt: datetime
}
```

### Annotation

```
{
  id: string (uuid)
  projectId: string (FK)
  bridgeId: string (data-bridge-id from HTML element)
  label: string (human-readable element description, fallback)
  positionX: number | null (% from left, fallback)
  positionY: number | null (% from top, fallback)
  content: string
  specData: JSON (structured spec: constraints, API, validation)
  giteaIssueId: number | null
  giteaIssueState: string | null
  createdAt: datetime
  updatedAt: datetime
}
```

### PrototypeVersion

```
{
  id: string (uuid)
  projectId: string (FK)
  conversationId: string (FK, the message that triggered this version)
  html: string (full HTML content)
  version: number (auto-increment per project)
  isCurrent: boolean
  createdAt: datetime
}
```

### Settings

```
{
  key: string (primary key, e.g., "gitea_url", "gitea_token", "openai_api_key")
  value: string (encrypted for sensitive values)
  updatedAt: datetime
}
```

Note: OpenAI API key is stored in the Settings table (encrypted) or via environment variable `OPENAI_API_KEY`. Environment variable takes precedence if set.

### GiteaWebhook

```
{
  id: string (uuid)
  projectId: string (FK)
  giteaWebhookId: number (ID returned by Gitea API)
  secret: string (HMAC secret for payload verification)
  createdAt: datetime
}
```

## Phased Delivery Plan

### Phase 1 — Core (能用)

- Project CRUD
- Chat interface with file upload (text + Markdown only)
- OpenAI API integration with streaming
- HTML/CSS/JS generation in sandboxed iframe
- Conversational modification (maintain context, regenerate)
- Share via unique link (read-only preview)

### Phase 2 — Specs (好用)

- Structured constraints in chat (device type, color scheme, component preferences)
- Multi-format file upload: PDF, Word, PowerPoint, images (OCR)
- Annotation system: click element → add note
- Spec panel: click element → view/edit structured specs

### Phase 3 — Gitea (串接)

- Gitea settings page (URL + token)
- Bind project to Gitea repo (new or existing)
- Push generated files to repo with version history
- Create Gitea issues from annotations/specs (single + bulk)

### Phase 4 — Full Loop (閉環)

- Gitea webhook: issue status sync back to prototype
- Visual status indicators on prototype elements
- Direct editing: drag, resize, modify properties on the prototype
- Behavior simulation: field validation, mock API responses, state transitions

## Non-Goals

- User authentication / account system (use link sharing instead)
- Real-time multi-user collaboration (out of scope for now)
- Mobile app version
- Support for frameworks (React/Vue) in generated output — pure HTML/CSS/JS only
- AI image generation for design assets

## Security Considerations

- Generated HTML runs in sandboxed iframe (`sandbox` attribute) to prevent XSS
- Gitea API token stored encrypted in SQLite
- File uploads validated by type and size
- OpenAI API key stored server-side only, never exposed to frontend
