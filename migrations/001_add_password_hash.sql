-- Add password_hash column to support email + password authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
