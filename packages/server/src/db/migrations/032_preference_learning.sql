-- Add confidence and source columns to user_preferences for preference learning
ALTER TABLE user_preferences ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0;
ALTER TABLE user_preferences ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- Create index for preference queries by key
CREATE INDEX IF NOT EXISTS idx_user_prefs_key ON user_preferences(key);
