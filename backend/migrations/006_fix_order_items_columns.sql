-- Migration 006: Add missing columns to order_items table
-- Date: 2026-01-12
-- Fixes: BUG-011 (missing error_message), BUG-012 (missing updated_at)

-- Add error_message column for tracking failed order items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add updated_at column for tracking updates
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
