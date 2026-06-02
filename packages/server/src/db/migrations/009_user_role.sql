-- Add role + is_active columns to users for admin gating.
-- SQLite ALTER TABLE ADD COLUMN does not support CHECK constraints, so we
-- enforce valid values ('admin' | 'user') and 0/1 at the application layer
-- (see services/userService.ts and middleware/requireAdmin.ts).

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Mark the earliest-created user as the initial admin so existing single-user
-- installs immediately gain admin privileges. Operators can transfer admin via UI.
UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);
