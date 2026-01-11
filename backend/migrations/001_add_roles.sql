-- Migration: Add multi-tier role system
-- WorxTech Internet Services LLC

-- Add role columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_name VARCHAR(50) DEFAULT 'customer';

-- Create roles definition table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create staff notes table for internal notes on entities
CREATE TABLE IF NOT EXISTS staff_notes (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'user', 'order', 'domain'
    entity_id INTEGER NOT NULL,
    staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for staff_notes
CREATE INDEX IF NOT EXISTS idx_staff_notes_entity ON staff_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_staff_notes_staff ON staff_notes(staff_user_id);

-- Insert default role definitions
INSERT INTO roles (level, name, display_name, description, permissions) VALUES
(0, 'customer', 'Customer', 'Regular customer with access to own domains, orders, and profile',
 '["view_own_domains", "view_own_orders", "manage_own_profile", "manage_cart"]'),
(1, 'support', 'Support Agent', 'View-only access to all customers, orders, and domains. Can add notes.',
 '["view_all_customers", "view_all_orders", "view_all_domains", "add_notes"]'),
(2, 'sales', 'Sales Manager', 'Support permissions plus refunds, pricing adjustments, and manual imports.',
 '["view_all_customers", "view_all_orders", "view_all_domains", "add_notes", "process_refunds", "adjust_pricing", "import_domains"]'),
(3, 'admin', 'Administrator', 'Full management access including user management, TLD pricing, and system settings.',
 '["view_all_customers", "view_all_orders", "view_all_domains", "add_notes", "process_refunds", "adjust_pricing", "import_domains", "manage_users", "manage_tld_pricing", "system_settings"]'),
(4, 'superadmin', 'Super Admin', 'Full system access including role assignment, audit logs, and danger zone operations.',
 '["*"]')
ON CONFLICT (level) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- Update existing admin users to Administrator level
UPDATE users SET role_level = 3, role_name = 'admin' WHERE is_admin = true AND role_level = 0;

-- Create audit_logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
