# Project Bridge — Design Spec

## Overview

A web-based tool that lets PMs describe requirements (via natural language or uploaded documents), generates interactive HTML/CSS/JS prototypes using AI, and integrates with Gitea for project management — bridging the gap between PM specs and engineering implementation.

## Problem

Multi-role teams (PM, frontend, backend, design) waste significant time in back-and-forth communication. PMs write specs that engineers misinterpret. Static documents lack interactivity. There is no single source of truth that is both visual and actionable.

## Solution

PM uploads specs or describes requirements → AI generates a live, interactive HTML prototype → PM annotates specs and constraints on the prototype → specs are pushed to Gitea as issues → engineers see issue status reflected back on the prototype.

## Core User Flow

```
PM uploads spec (PDF/PPT/Word/Image/Markdown/text)
  → Text extraction + parsing
  → AI (OpenAI API) generates HTML/CSS/JS
  → Sandboxed iframe preview of interactive prototype
  → PM iterates via conversation or direct editing
  → PM adds annotations and spec details
  → One-click push to Gitea: create repo + create issues
  → Engineers develop on Gitea
  → Issue status syncs back to prototype UI
  → PM tracks development progress on the prototype
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
- **Output**: Single HTML file with inline CSS and JS (no framework dependencies)
- **Streaming**: Server proxies OpenAI stream to frontend via SSE for real-time generation feedback
- **Structured constraints**: Device type, color scheme, and other options are injected into the system prompt

## Annotation & Spec System

- **Annotations**: PM clicks on a UI element and adds a text note (e.g., "max 50 chars", "calls POST /api/users")
- **Spec panel**: Clicking an element shows its structured spec — field constraints, API endpoints, validation rules, business logic
- **Storage**: Annotations are stored as JSON metadata linked to CSS selectors or element IDs in the generated HTML
- **Visibility**: Annotations appear as indicators on the prototype; hovering/clicking reveals details

## Gitea Integration

### Configuration

- Global settings page: Gitea server URL + personal access token
- Per-project binding: link a prototype project to a new or existing Gitea repo

### Repo Sync

- Generated HTML/CSS/JS files are committed and pushed to the bound Gitea repo
- Each AI generation/modification creates a new commit, providing version history
- Commit messages reference the conversation prompt that triggered the change

### Issue Creation

- PM selects annotations/specs and creates Gitea issues with one click
- Issue contains: title, description, spec details, link back to prototype
- Bulk creation supported: select multiple specs → create multiple issues at once

### Status Sync Back

- Gitea webhook notifies the backend when issue status changes
- Prototype UI reflects development status per element:
  - 🔴 Not started (issue open, no assignee)
  - 🟡 In progress (issue assigned/in progress)
  - 🟢 Done (issue closed)
- PM can see overall project progress at a glance on the prototype

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

### Annotation

```
{
  id: string (uuid)
  projectId: string (FK)
  selector: string (CSS selector or element ID)
  content: string
  specData: JSON (structured spec: constraints, API, validation)
  giteaIssueId: number | null
  giteaIssueState: string | null
  createdAt: datetime
  updatedAt: datetime
}
```

### Settings

```
{
  giteaUrl: string
  giteaToken: string (encrypted)
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
