-- Generation settings: temperature slider and seed prompt per project
ALTER TABLE projects ADD COLUMN generation_temperature REAL DEFAULT 0.3;
ALTER TABLE projects ADD COLUMN seed_prompt TEXT DEFAULT '';
