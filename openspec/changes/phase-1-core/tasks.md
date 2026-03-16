## 1. Project Setup

- [ ] 1.1 Initialize monorepo with pnpm workspaces: root `package.json`, `packages/client/`, `packages/server/`
- [ ] 1.2 Setup server: Express + TypeScript, tsconfig, dev scripts (ts-node-dev)
- [ ] 1.3 Setup client: React + Vite + TypeScript, proxy config to backend
- [ ] 1.4 Setup SQLite database with better-sqlite3: connection, migration runner, initial schema (projects, conversations, prototype_versions tables)

## 2. Project Management API

- [ ] 2.1 Implement POST `/api/projects` — create project with uuid, share token, timestamps
- [ ] 2.2 Implement GET `/api/projects` — list all projects ordered by updatedAt desc
- [ ] 2.3 Implement GET `/api/projects/:id` — get project detail with current prototype HTML
- [ ] 2.4 Implement PUT `/api/projects/:id` — update project name
- [ ] 2.5 Implement DELETE `/api/projects/:id` — delete project and cascade (conversations, versions)

## 3. AI Chat & Generation API

- [ ] 3.1 Create system prompt template file with instructions for single-file HTML output, semantic classes, `data-bridge-id` attributes
- [ ] 3.2 Implement POST `/api/projects/:id/chat` — accept message, build prompt with sliding window (last 20 messages), call OpenAI API with streaming
- [ ] 3.3 Implement SSE streaming: proxy OpenAI stream chunks to client via Server-Sent Events
- [ ] 3.4 On stream completion: extract HTML from response, store Conversation entry (user + assistant), create new PrototypeVersion (set as current)
- [ ] 3.5 Implement GET `/api/projects/:id/conversations` — return conversation history in chronological order
- [ ] 3.6 Add OpenAI API error handling: retry with backoff (max 3), return SSE error event on failure

## 4. Share API

- [ ] 4.1 Implement GET `/api/share/:shareToken` — return project name and current prototype HTML, or 404

## 5. Frontend — Project Home Page

- [ ] 5.1 Create app layout with React Router: routes for home (`/`), workspace (`/project/:id`), share (`/share/:token`)
- [ ] 5.2 Build project list page: fetch projects, display as cards (name, thumbnail placeholder, last modified)
- [ ] 5.3 Build "New Project" dialog: name input, create via API, navigate to workspace on success

## 6. Frontend — Project Workspace

- [ ] 6.1 Build workspace layout: left chat panel, center preview area, top toolbar
- [ ] 6.2 Build chat panel: message input, message list, send button, display user/assistant messages
- [ ] 6.3 Implement SSE client: connect to chat endpoint, progressively render streaming AI response in chat panel
- [ ] 6.4 Build prototype preview: sandboxed iframe with `srcdoc`, update on generation complete
- [ ] 6.5 Build device size selector in toolbar: Desktop (full width), Tablet (768x1024), Mobile (375x667)
- [ ] 6.6 Build empty state for preview area when no prototype exists yet
- [ ] 6.7 Build share button in toolbar: copy share link to clipboard with toast notification

## 7. Frontend — Share Preview Page

- [ ] 7.1 Build share preview page: fetch project via share token, render prototype in sandboxed iframe (read-only)
- [ ] 7.2 Add device size selector to share page
- [ ] 7.3 Build error page for invalid share tokens

## 8. Settings & Configuration

- [ ] 8.1 Create Settings table (key-value store) and API: GET/PUT `/api/settings` for OpenAI API key
- [ ] 8.2 Support `OPENAI_API_KEY` environment variable with precedence over DB setting
- [ ] 8.3 Build settings dialog accessible from home page to configure OpenAI API key

## 9. Integration Testing

- [ ] 9.1 Test project CRUD API endpoints (create, list, get, update, delete, cascade)
- [ ] 9.2 Test chat endpoint: verify conversation storage, prototype version creation, SSE stream format
- [ ] 9.3 Test share endpoint: valid token returns data, invalid token returns 404
- [ ] 9.4 Smoke test: end-to-end flow from project creation → chat → generation → share link
