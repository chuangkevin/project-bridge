# Design Bridge

AI-powered prototype generator — from idea to interactive prototype in one conversation.

## What is Design Bridge?

Design Bridge is an AI prototype generation platform that lets you describe a UI in natural language and get a fully interactive HTML prototype in seconds. Think of it as a bridge between your design ideas and working prototypes.

**Live:** [designbridge.housefun.com.tw](https://designbridge.housefun.com.tw)

## Features

### Core
- **AI Prototype Generation** — Describe your UI in Chinese or English, get multi-page interactive HTML prototypes with real content, images, and navigation
- **Multi-page Support** — AI detects page structure from your description and generates interconnected pages (e.g., product list -> detail -> cart -> checkout)
- **Micro-adjust** — Iterate on generated prototypes with follow-up messages without regenerating from scratch
- **AI Thinking Transparency** — See the AI's reasoning process, detected pages, and generation steps in real-time

### Design Tools
- **Architecture Diagram** — Visual page flow editor with drag-and-drop nodes and connections
- **Design Profile** — Upload reference designs (PDF/image), AI extracts colors, typography, and layout patterns
- **Global Design System** — Define design conventions (colors, fonts) applied across all projects
- **Art Style Detection** — Upload reference images, AI detects and applies the visual style
- **Agent Skills** — Custom AI instructions injected into generation (project-scoped or global)
- **Prompt Templates** — Pre-built prompts for common UI patterns (forms, dashboards, e-commerce, etc.)

### Developer Tools
- **Code Viewer** — Syntax-highlighted HTML source with file tree, search (Ctrl+F), and one-click copy
- **API Binding** — Define API endpoints per element or per page, export as JSON
- **Annotations** — Mark up elements with design specs and notes
- **Export** — Download HTML, export API bindings, share via public URL

### UX
- **Dark Mode** — System preference detection + manual toggle
- **Drag & Drop Projects** — Reorder projects on homepage with custom sort order
- **Resizable Panels** — Drag to resize chat and preview panels
- **Device Preview** — Desktop, tablet, and mobile viewport switching
- **Version History** — Browse and restore previous prototype versions

### Platform
- **Multi-user** — User management with admin/user roles
- **Session Auth** — Bearer token sessions + legacy admin password support
- **Multiple API Keys** — Round-robin Gemini API key rotation with auto-retry on 429
- **External Skills Sync** — Auto-import SKILL.md files from external directories (SKILLS_DIR env var)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Express + TypeScript + ts-node-dev |
| Database | SQLite (better-sqlite3) + WAL mode |
| AI | Google Gemini 2.5 Flash (streaming SSE) |
| Styling | Inline CSS-in-JS + CSS custom properties (dark mode) |
| Code Highlighting | prism-react-renderer |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Architecture Diagram | @xyflow/react (React Flow) |
| Testing | Playwright E2E |
| CI/CD | GitHub Actions (Docker Hub) + Gitea Actions (ArgoCD + K8s) |
| Container | Docker (node:22-alpine) |
| Deployment | K8s (ArgoCD) + Docker Compose (Tailscale SSH) |

## Project Structure

```
project-bridge/
  packages/
    client/          # React frontend (Vite, port 5188)
    server/          # Express API server (port 3001)
    e2e/             # Playwright E2E tests
  openspec/          # Feature specs and task tracking
  .github/workflows/ # GitHub CI/CD (Docker Hub + Tailscale deploy)
  .gitea/workflows/  # Gitea CI/CD (internal registry + ArgoCD)
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development (both client + server)
pnpm --filter server dev   # http://localhost:3001
pnpm --filter client dev   # http://localhost:5188

# Environment variables (packages/server/.env)
GEMINI_API_KEY=your-key    # or set via Settings UI
PORT=3001
SKILLS_DIR=path/to/skills  # optional: auto-import SKILL.md files
```

## Deployment

### Docker Compose (GitHub CD)
```bash
docker compose up -d
# Serves on port 5123 -> 3001
```

### K8s / ArgoCD (Gitea CD)
Push to `main` triggers: build image -> push to internal registry -> update ArgoCD app -> sync

## OpenSpec Feature Tracking

Feature development is tracked using [OpenSpec](https://github.com/anthropics/openspec):

```bash
# View all changes and progress
ls openspec/changes/

# Key completed features:
# - admin-password-protection, user-management
# - ai-thinking-transparency, code-viewer
# - dark-mode, drag-sort, project-mode-selection
# - page-level-api-binding, prompt-template-library
# - agent-skill-management, parallel-generation
# - architecture-versioning, design-spec-to-prototype
```

## License

Private / Internal use only.
