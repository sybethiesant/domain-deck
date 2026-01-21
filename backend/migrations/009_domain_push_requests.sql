-- Domain Push Requests table
-- Allows users to transfer domain ownership to other users on the platform

CREATE TABLE IF NOT EXISTS domain_push_requests (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_email VARCHAR(255), -- Store email for display purposes
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected, cancelled
    initiated_by_admin BOOLEAN DEFAULT false, -- If true, no acceptance needed
    notes TEXT, -- Optional message from sender
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP, -- When accepted/rejected
    UNIQUE(domain_id, status) -- Only one pending request per domain
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_domain_push_from_user ON domain_push_requests(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_domain_push_to_user ON domain_push_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_domain_push_domain ON domain_push_requests(domain_id, status);

-- Partial unique index to ensure only one pending request per domain
DROP INDEX IF EXISTS idx_domain_push_pending_unique;
CREATE UNIQUE INDEX idx_domain_push_pending_unique ON domain_push_requests(domain_id) WHERE status = 'pending';
