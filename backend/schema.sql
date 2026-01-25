-- Domain Reseller Database Schema
-- PostgreSQL

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    company_name VARCHAR(200),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'US',
    is_admin BOOLEAN DEFAULT false,
    stripe_customer_id VARCHAR(255),
    theme_preference VARCHAR(10) DEFAULT 'system',
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Domain contacts (WHOIS information)
CREATE TABLE domain_contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    contact_type VARCHAR(20) DEFAULT 'registrant',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    organization VARCHAR(200),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    phone_ext VARCHAR(10),
    fax VARCHAR(30),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'US',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer's registered domains
CREATE TABLE domains (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    tld VARCHAR(20) NOT NULL,
    enom_order_id VARCHAR(100),
    enom_account VARCHAR(100) DEFAULT 'main',
    status VARCHAR(50) DEFAULT 'pending',
    registration_date TIMESTAMP,
    expiration_date TIMESTAMP,
    auto_renew BOOLEAN DEFAULT true,
    privacy_enabled BOOLEAN DEFAULT false,
    lock_status BOOLEAN DEFAULT true,
    nameservers JSONB DEFAULT '[]',
    registrant_contact_id INTEGER REFERENCES domain_contacts(id),
    admin_contact_id INTEGER REFERENCES domain_contacts(id),
    tech_contact_id INTEGER REFERENCES domain_contacts(id),
    billing_contact_id INTEGER REFERENCES domain_contacts(id),
    last_synced_at TIMESTAMP,
    enom_status_raw JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TLD pricing (your markup over eNom cost)
CREATE TABLE tld_pricing (
    id SERIAL PRIMARY KEY,
    tld VARCHAR(20) UNIQUE NOT NULL,
    cost_register DECIMAL(10,2) NOT NULL,
    cost_renew DECIMAL(10,2) NOT NULL,
    cost_transfer DECIMAL(10,2) NOT NULL,
    price_register DECIMAL(10,2) NOT NULL,
    price_renew DECIMAL(10,2) NOT NULL,
    price_transfer DECIMAL(10,2) NOT NULL,
    price_privacy DECIMAL(10,2) DEFAULT 9.99,
    min_years INTEGER DEFAULT 1,
    max_years INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    promo_price DECIMAL(10,2),
    promo_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopping cart
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    item_type VARCHAR(30) NOT NULL,
    domain_name VARCHAR(255) NOT NULL,
    tld VARCHAR(20) NOT NULL,
    years INTEGER DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    options JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    payment_method VARCHAR(50),
    payment_status VARCHAR(30) DEFAULT 'pending',
    billing_address JSONB,
    notes TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order line items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
    item_type VARCHAR(30) NOT NULL,
    domain_name VARCHAR(255) NOT NULL,
    tld VARCHAR(20) NOT NULL,
    years INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_price DECIMAL(10,2) NOT NULL,
    enom_order_id VARCHAR(100),
    enom_status VARCHAR(50),
    enom_response JSONB,
    status VARCHAR(30) DEFAULT 'pending',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Domain transfers tracking
CREATE TABLE domain_transfers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(id),
    domain_name VARCHAR(255) NOT NULL,
    tld VARCHAR(20) NOT NULL,
    auth_code VARCHAR(255),
    enom_transfer_id VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    current_registrar VARCHAR(255),
    transfer_requested_at TIMESTAMP,
    transfer_completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity log (audit trail)
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- App settings
CREATE TABLE app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default TLD pricing
INSERT INTO tld_pricing (tld, cost_register, cost_renew, cost_transfer, price_register, price_renew, price_transfer) VALUES
('com', 8.99, 8.99, 8.99, 12.99, 14.99, 12.99),
('net', 9.99, 9.99, 9.99, 13.99, 15.99, 13.99),
('org', 9.99, 9.99, 9.99, 13.99, 15.99, 13.99),
('io', 32.00, 32.00, 32.00, 44.99, 44.99, 44.99),
('co', 25.00, 25.00, 25.00, 29.99, 29.99, 29.99),
('dev', 12.00, 12.00, 12.00, 16.99, 16.99, 16.99),
('app', 14.00, 14.00, 14.00, 19.99, 19.99, 19.99),
('biz', 8.99, 8.99, 8.99, 14.99, 14.99, 14.99),
('info', 8.99, 8.99, 8.99, 14.99, 14.99, 14.99),
('us', 6.99, 6.99, 6.99, 11.99, 11.99, 11.99);

-- Indexes
CREATE INDEX idx_domains_user_id ON domains(user_id);
CREATE INDEX idx_domains_status ON domains(status);
CREATE INDEX idx_domains_expiration ON domains(expiration_date);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_cart_user_id ON cart_items(user_id);
CREATE INDEX idx_cart_session ON cart_items(session_id);
CREATE INDEX idx_cart_expires ON cart_items(expires_at);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_created ON activity_logs(created_at);
CREATE INDEX idx_domain_contacts_user ON domain_contacts(user_id);
CREATE INDEX idx_transfers_user ON domain_transfers(user_id);
CREATE INDEX idx_transfers_status ON domain_transfers(status);
