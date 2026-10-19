-- Add LQIP (Low-Quality Image Placeholder) column to deliverables
-- Stores a tiny ~300 byte base64 data URL for instant blur-up previews
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS blur_data_url text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS height integer;
