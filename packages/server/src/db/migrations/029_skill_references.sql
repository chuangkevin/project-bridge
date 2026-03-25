-- Add source_path and depends_on columns for skill directory import & references
ALTER TABLE agent_skills ADD COLUMN source_path TEXT;
ALTER TABLE agent_skills ADD COLUMN depends_on TEXT DEFAULT '[]';
