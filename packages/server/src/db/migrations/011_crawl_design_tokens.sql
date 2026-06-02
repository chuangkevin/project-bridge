-- Plan 19: add crawled_urls + design_tokens to projects for URL crawler feature,
-- and add analysis_status/visual_analysis columns to attachments for vision analysis.

ALTER TABLE projects ADD COLUMN crawled_urls TEXT;
ALTER TABLE projects ADD COLUMN design_tokens TEXT;

ALTER TABLE attachments ADD COLUMN analysis_status TEXT DEFAULT 'pending';
ALTER TABLE attachments ADD COLUMN visual_analysis TEXT;
