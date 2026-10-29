-- One-time operator-reviewed reference-data initialization for the existing Azure staging DB.
-- Geographic labels are NOT claims of rental/delivery coverage. No products, accounts, ZIP
-- mappings, fixture photos, simulated reservations or business activity are inserted.
-- Execute only with the authorized staging migrator connection after confirming backups.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'dzirent_staging' THEN
    RAISE EXCEPTION 'Refusing to seed metros outside dzirent_staging';
  END IF;
  IF EXISTS (
    SELECT 1 FROM metros
    WHERE (slug = 'austin' AND id <> '2a9f9bea-25b8-5c50-9cc7-ff71b57f467a'::uuid)
       OR (slug = 'dallas-fort-worth' AND id <> 'df6e8eea-fe77-5663-a5f7-c291bae96e3b'::uuid)
       OR (slug = 'houston' AND id <> '9b4f0c8b-16ab-5235-8f83-6a24d24bb3c2'::uuid)
       OR (slug = 'san-antonio' AND id <> 'b716c482-5802-5139-b1f3-89abf3046354'::uuid)
       OR (slug = 'other-texas' AND id <> 'fb8e2027-b92c-5cb8-9323-b84b154c5706'::uuid)
  ) THEN
    RAISE EXCEPTION 'Existing metro IDs differ from the canonical taxonomy; aborting';
  END IF;
END
$guard$;

INSERT INTO metros (id, slug, label, region, country_code, sort_order, active)
VALUES
 ('2a9f9bea-25b8-5c50-9cc7-ff71b57f467a', 'austin', 'Austin', 'TX', 'US', 10, TRUE),
 ('df6e8eea-fe77-5663-a5f7-c291bae96e3b', 'dallas-fort-worth', 'Dallas–Fort Worth', 'TX', 'US', 20, TRUE),
 ('9b4f0c8b-16ab-5235-8f83-6a24d24bb3c2', 'houston', 'Houston', 'TX', 'US', 30, TRUE),
 ('b716c482-5802-5139-b1f3-89abf3046354', 'san-antonio', 'San Antonio', 'TX', 'US', 40, TRUE),
 ('fb8e2027-b92c-5cb8-9323-b84b154c5706', 'other-texas', 'Other Texas', 'TX', 'US', 50, TRUE)
ON CONFLICT (id) DO NOTHING;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM metros WHERE slug = 'other-texas' AND active) THEN
    RAISE EXCEPTION 'Required active Other Texas fallback is absent';
  END IF;
  IF (SELECT count(*) FROM metros WHERE slug IN
       ('austin', 'dallas-fort-worth', 'houston', 'san-antonio', 'other-texas')
       AND active) <> 5 THEN
    RAISE EXCEPTION 'Five canonical active geography labels not provisioned';
  END IF;
END
$check$;
COMMIT;
