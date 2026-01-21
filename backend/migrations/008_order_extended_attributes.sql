-- Add extended_attributes column to orders table
-- This stores ccTLD-specific attributes (e.g., .in requires Aadhaar/PAN numbers)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS extended_attributes JSONB DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN orders.extended_attributes IS 'ccTLD-specific registration attributes (e.g., in_aadharnumber, uk_legal_type)';
