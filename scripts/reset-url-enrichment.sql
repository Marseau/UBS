-- Reset URL enrichment data
-- This will allow re-scraping all URLs with the new optimized scraper

UPDATE instagram_leads
SET
  url_enriched = false,
  additional_emails = NULL,
  additional_phones = NULL
WHERE url_enriched = true;

-- Show stats
SELECT
  COUNT(*) as total_rows_updated,
  COUNT(CASE WHEN bio_url IS NOT NULL THEN 1 END) as rows_with_bio_url
FROM instagram_leads
WHERE url_enriched = false;
