-- M1 anonymous-access migration: drop per-user login, switch to admin-password-gate.
--
-- Background: the M1 UX is fully anonymous. Anyone hitting the site lands on
-- /projects and can create/edit/use projects with no login. The ONLY thing that
-- still authenticates is admin-only Settings operations (API keys, MCP CRUD,
-- OpenCode config, Users management). Those now share a single shared admin
-- password stored in `settings.admin_password_hash` instead of per-user logins.
--
-- This migration:
--   1) Makes projects.owner_id nullable so anonymous-created projects don't
--      need a synthetic user row. Existing projects keep their owner_id; new
--      ones can omit it. We DO NOT enforce ownership at the application layer
--      anymore (any visitor can see/edit any project — that is the spec).
--   2) Leaves the existing users / sessions / users.password_hash columns in
--      place (no destructive drops) so an operator who re-enables login in a
--      future version still has their data. They are simply unreferenced by
--      the current code path.
--   3) Admin password lives in `settings` keyed `admin_password_hash`; the
--      bcrypt hash is written by POST /api/auth/setup (first-run) and updated
--      by POST /api/auth/change. There is no row to add in this migration.

-- SQLite can't simply ALTER COLUMN to drop NOT NULL on a FK column, so we
-- rebuild the projects table. Other tables (turns/facts/etc) reference
-- projects.id (not owner_id), so they don't need touching.
CREATE TABLE projects_new (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  share_token     TEXT UNIQUE,
  council_config  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO projects_new (id, name, owner_id, share_token, council_config, created_at, updated_at)
  SELECT id, name, owner_id, share_token, council_config, created_at, updated_at FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;
CREATE INDEX idx_projects_owner ON projects(owner_id);
