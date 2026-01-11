-- Balance Management Tables
-- Created: 2026-01-11

-- Balance Settings Table
CREATE TABLE IF NOT EXISTS balance_settings (
    id SERIAL PRIMARY KEY,
    auto_refill_enabled BOOLEAN DEFAULT false,
    min_balance_threshold DECIMAL(10,2) DEFAULT 50.00,
    refill_amount DECIMAL(10,2) DEFAULT 100.00,
    low_balance_alert DECIMAL(10,2) DEFAULT 25.00,
    email_alerts_enabled BOOLEAN DEFAULT true,
    alert_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Balance Transactions Table (for logging refills and purchases)
CREATE TABLE IF NOT EXISTS balance_transactions (
    id SERIAL PRIMARY KEY,
    transaction_type VARCHAR(50) NOT NULL, -- 'refill', 'purchase', 'renewal', 'transfer'
    amount DECIMAL(10,2) NOT NULL,
    fee_amount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2),
    balance_before DECIMAL(10,2),
    balance_after DECIMAL(10,2),
    domain_name VARCHAR(255),
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    auto_refill BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created ON balance_transactions(created_at DESC);

-- Insert default settings if none exist
INSERT INTO balance_settings (auto_refill_enabled, min_balance_threshold, refill_amount, low_balance_alert, email_alerts_enabled)
SELECT false, 50.00, 100.00, 25.00, true
WHERE NOT EXISTS (SELECT 1 FROM balance_settings LIMIT 1);
