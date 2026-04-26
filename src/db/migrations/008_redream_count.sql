-- src/db/migrations/008_redream_count.sql
ALTER TABLE conversations ADD COLUMN redream_count integer NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_redream_at timestamp with time zone;
