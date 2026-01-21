-- Migration 010: Fix Critical Issues from Code Audit
-- Date: 2026-01-21
-- This migration adds all missing tables and columns identified in the code audit

-- 1. Add missing users columns (CRIT-006, CRIT-012)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_name VARCHAR(50) DEFAULT 'customer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_payment_method_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_renew_payment_method_id VARCHAR(255);

-- 2. Create staff_notes table (CRIT-011)
CREATE TABLE IF NOT EXISTS staff_notes (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('user', 'order', 'domain')),
    entity_id INTEGER NOT NULL,
    staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_notes_entity ON staff_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_staff_notes_staff_user ON staff_notes(staff_user_id);

-- 3. Create audit_logs table (HIGH-010)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 4. Create saved_payment_methods table (CRIT-004)
CREATE TABLE IF NOT EXISTS saved_payment_methods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) DEFAULT 'card',
    brand VARCHAR(50),
    last4 VARCHAR(4),
    exp_month INTEGER,
    exp_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user ON saved_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_stripe ON saved_payment_methods(stripe_payment_method_id);

-- 5. Create balance_transactions table (CRIT-005)
CREATE TABLE IF NOT EXISTS balance_transactions (
    id SERIAL PRIMARY KEY,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('credit', 'debit', 'refill', 'purchase', 'refund')),
    description TEXT,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    balance_after DECIMAL(10,2),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created ON balance_transactions(created_at);

-- 6. Create roles table (CRIT-013)
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    level INTEGER NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT INTO roles (name, level, description, permissions) VALUES
    ('customer', 0, 'Regular customer', '[]'),
    ('support', 1, 'Support staff with limited access', '["view_users", "view_orders"]'),
    ('staff', 2, 'Staff with order management', '["view_users", "view_orders", "manage_orders", "add_notes"]'),
    ('admin', 3, 'Administrator with full access', '["view_users", "manage_users", "view_orders", "manage_orders", "manage_domains", "add_notes", "manage_settings"]'),
    ('superadmin', 4, 'Super administrator', '["*"]')
ON CONFLICT (name) DO NOTHING;

-- 7. Add missing order columns (CRIT-008)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS registrant_contact JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS extended_attributes JSONB DEFAULT '{}';

-- 8. Add missing order_items column (HIGH-002)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 9. Update existing users to have proper role_level based on is_admin
UPDATE users SET role_level = 3, role_name = 'admin' WHERE is_admin = true AND role_level = 0;
UPDATE users SET role_level = 0, role_name = 'customer' WHERE is_admin = false AND role_level IS NULL;

-- 10. Add trigger to update updated_at on staff_notes
CREATE OR REPLACE FUNCTION update_staff_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_staff_notes_updated_at ON staff_notes;
CREATE TRIGGER trigger_staff_notes_updated_at
    BEFORE UPDATE ON staff_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_notes_updated_at();

-- 11. Add trigger to update updated_at on saved_payment_methods
DROP TRIGGER IF EXISTS trigger_saved_payment_methods_updated_at ON saved_payment_methods;
CREATE TRIGGER trigger_saved_payment_methods_updated_at
    BEFORE UPDATE ON saved_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
