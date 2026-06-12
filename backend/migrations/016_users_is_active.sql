-- Users is_active column
-- schema.sql has always defined users.is_active, but no migration ever added
-- it to existing databases. The auth middleware now selects it on every
-- request, so its absence breaks all authenticated traffic (instant logout).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Existing accounts stay active
UPDATE users SET is_active = true WHERE is_active IS NULL;

COMMENT ON COLUMN users.is_active IS 'Disabled accounts (false) are rejected by the auth middleware on every request';
