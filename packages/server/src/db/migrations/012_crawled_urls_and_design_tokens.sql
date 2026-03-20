-- Add crawled_urls and design_tokens columns to projects table
ALTER TABLE projects ADD COLUMN crawled_urls TEXT DEFAULT '[]';
ALTER TABLE projects ADD COLUMN design_tokens TEXT DEFAULT NULL;
