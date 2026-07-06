-- Store client-side progress detail (JSON string) so download list can show realtime-like info across sessions
ALTER TABLE downloads
ADD COLUMN IF NOT EXISTS progress_detail TEXT;
