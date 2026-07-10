-- Renumber duplicate (app_id, version_code) pairs before adding unique index.
-- Keeps the oldest record per duplicate group unchanged.
WITH duplicates AS (
  SELECT
    id,
    app_id,
    ROW_NUMBER() OVER (
      PARTITION BY app_id, version_code
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM app_versions
),
offsets AS (
  SELECT
    d.id,
    d.app_id,
  (
    SELECT COALESCE(MAX(version_code), 0)
    FROM app_versions v
    WHERE v.app_id = d.app_id
  ) + ROW_NUMBER() OVER (PARTITION BY d.app_id ORDER BY d.rn) AS new_code
  FROM duplicates d
  WHERE d.rn > 1
)
UPDATE app_versions av
SET version_code = o.new_code
FROM offsets o
WHERE av.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_versions_app_id_version_code
  ON app_versions(app_id, version_code);
