# Design: Architecture Versioning

## Database Schema

New table `architecture_versions`:

```sql
CREATE TABLE architecture_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  version INTEGER NOT NULL,
  arch_data TEXT NOT NULL,          -- JSON snapshot of the full arch_data
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, version)
);

CREATE INDEX idx_arch_versions_project ON architecture_versions(project_id, version DESC);
```

- `id`: UUID primary key.
- `project_id`: foreign key to `projects.id`.
- `version`: auto-incrementing integer per project (derived as `MAX(version) + 1` at insert time).
- `arch_data`: full JSON snapshot of `arch_data` at that point in time.
- `description`: human-readable label (e.g. "Added page: Login", "Deleted edge", "Manual save", "Pre-restore snapshot").
- `created_at`: ISO 8601 timestamp.

## Version Save Triggers

A new version is saved when any of the following occurs:

1. **Page added** -- description: `"Added page: <name>"`
2. **Page deleted** -- description: `"Deleted page: <name>"`
3. **Edge added** (onConnect) -- description: `"Added edge"`
4. **Edge deleted** -- description: `"Deleted edge"`
5. **Manual save button** pressed -- description: `"Manual save"`

## Debounce Strategy

- Client-side debounce of **5 seconds** after the last qualifying change before calling the version-save API.
- If multiple changes happen within the 5s window, they are collapsed into a single version with a combined description.
- The debounce timer resets on each new qualifying change.

## API Endpoints

All endpoints are scoped under `/api/projects/:id/architecture/versions`.

### GET /api/projects/:id/architecture/versions

List versions for a project, ordered by version DESC (newest first).

**Response:**
```json
{
  "versions": [
    { "id": "uuid", "version": 12, "description": "Added page: Login", "created_at": "2026-03-20T10:30:00Z" },
    ...
  ]
}
```

### POST /api/projects/:id/architecture/versions

Save a new version snapshot.

**Request body:**
```json
{
  "arch_data": { ... },
  "description": "Added page: Login"
}
```

**Response:**
```json
{ "id": "uuid", "version": 13 }
```

After insert, auto-prune is triggered: delete all versions for this project where version rank > 50 (keep the 50 most recent).

### POST /api/projects/:id/architecture/versions/:versionId/restore

Restore a previous version.

**Server-side behavior:**
1. Save the **current** `arch_data` as a new version with description `"Pre-restore snapshot"` (safety net).
2. Read `arch_data` from the target version.
3. Update `projects.arch_data` with the restored data.
4. Return the restored `arch_data`.

**Response:**
```json
{
  "ok": true,
  "arch_data": { ... },
  "safety_version_id": "uuid"
}
```

## UI Design

### Version History Panel

- Rendered as a collapsible side panel or dropdown in `ArchFlowchart`, toggled by a toolbar button (e.g. "Version History" / "版本紀錄").
- Shows a scrollable list of versions, each displaying:
  - Version number badge
  - Description text
  - Relative timestamp (e.g. "3 minutes ago") with full timestamp on hover
  - "Restore" button
- The current/latest version is visually indicated (e.g. highlighted or tagged "current").
- Clicking "Restore" opens a confirmation dialog before executing the restore.

### Save Button

- A "Save Version" / "儲存版本" button in the toolbar allows manual version creation at any time.

## Data Retention

- Maximum **50 versions** per project.
- After each new version insert, a cleanup query deletes any versions beyond the 50 most recent:
  ```sql
  DELETE FROM architecture_versions
  WHERE project_id = ? AND id NOT IN (
    SELECT id FROM architecture_versions
    WHERE project_id = ?
    ORDER BY version DESC
    LIMIT 50
  )
  ```
