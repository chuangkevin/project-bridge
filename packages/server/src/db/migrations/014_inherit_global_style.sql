-- Per-project global style inheritance flag (default ON).
-- When 1, design-mode generation appends global_design_* settings to the system prompt.
ALTER TABLE projects ADD COLUMN inherit_global_style INTEGER NOT NULL DEFAULT 1;
