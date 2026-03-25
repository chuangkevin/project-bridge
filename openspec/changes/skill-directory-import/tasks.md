# Tasks: skill-directory-import

## 1. DB Migration

- [x] 1.1 Create migration `029_skill_references.sql`: add `source_path TEXT` and `depends_on TEXT` columns to `agent_skills`

## 2. Server — Batch Action API

- [x] 2.1 Add `POST /api/skills/batch-action` endpoint: accept `{ ids, action }`, perform enable/disable/delete
- [x] 2.2 Update `POST /api/skills/batch` to save `source_path` and parse `depends` from frontmatter
- [x] 2.3 Add reference detection function: scan skill content for mentions of other skill names
- [x] 2.4 After batch import, recalculate `depends_on` for ALL skills
- [x] 2.5 Add `GET /api/skills/:id/references` endpoint: return `{ outgoing, incoming }`
- [x] 2.6 Add `GET /api/skills/graph` endpoint: return full adjacency list

## 3. Client — Import Preview Dialog

- [x] 3.1 Replace current inline `showDirectoryPicker` with a proper preview dialog component
- [x] 3.2 Show parsed skills list: name, description, status badge (新增/更新), depends tags
- [x] 3.3 Add fallback `<input webkitdirectory>` for non-Chrome browsers
- [x] 3.4 Confirm button calls batch API, shows result summary

## 4. Client — Reference Tags

- [x] 4.1 Fetch references for each skill on settings page load
- [x] 4.2 Display "引用:" and "被引用:" tags on each skill card
- [x] 4.3 Tags are clickable — scroll to referenced skill
- [x] 4.4 Delete warning when skill has incoming references

## 5. Client — Batch Operations

- [x] 5.1 Add checkbox to skill table header (select all / deselect all)
- [x] 5.2 Add checkbox to each skill row
- [x] 5.3 Floating batch action bar: "啟用 (N)", "停用 (N)", "刪除 (N)"
- [x] 5.4 Delete confirmation dialog
- [x] 5.5 Call batch-action API, refresh list on success

## 6. Testing

- [x] 6.1 TypeScript check (server + client)
- [x] 6.2 E2E test: skill CRUD, batch import, reference detection, batch actions, UI
- [ ] 6.3 Manual test: import from D:\Projects\HPSkills, verify references detected
- [ ] 6.4 Manual test: fallback input for non-Chrome
