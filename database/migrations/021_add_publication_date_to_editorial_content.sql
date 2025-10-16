-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 021_add_publication_date_to_editorial_content.sql
-- Description: Add publication_date field to editorial_content table
-- Author: Claude Code
-- Date: 2025-10-16
--
-- Changes:
-- ✅ Add publication_date field (DATE type)
-- ✅ Set default to Monday of the week (calculated from week_number + year)
-- ═══════════════════════════════════════════════════════════════════════════

-- Add publication_date column (Monday of the week)
ALTER TABLE editorial_content
ADD COLUMN publication_date DATE;

-- Add comment
COMMENT ON COLUMN editorial_content.publication_date IS 'Data de publicação da semana editorial (segunda-feira da semana)';

-- Create function to calculate Monday of ISO week
CREATE OR REPLACE FUNCTION get_monday_of_week(week_num INTEGER, year_num INTEGER)
RETURNS DATE AS $$
DECLARE
  jan1 DATE;
  day_of_week INTEGER;
  days_to_monday INTEGER;
  first_monday DATE;
  target_date DATE;
BEGIN
  -- Get January 1st of the year
  jan1 := make_date(year_num, 1, 1);

  -- Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  day_of_week := EXTRACT(DOW FROM jan1);

  -- Calculate days to add to get to Monday
  IF day_of_week <= 1 THEN
    days_to_monday := 1 - day_of_week;
  ELSE
    days_to_monday := 8 - day_of_week;
  END IF;

  -- Get first Monday of the year
  first_monday := jan1 + days_to_monday;

  -- Calculate target date (Monday of target week)
  target_date := first_monday + ((week_num - 1) * 7);

  RETURN target_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing records with calculated publication_date
UPDATE editorial_content
SET publication_date = get_monday_of_week(week_number, year)
WHERE publication_date IS NULL;

-- Create index for publication_date queries
CREATE INDEX idx_editorial_publication_date
  ON editorial_content(publication_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Verify the new column
SELECT
  week_number,
  year,
  publication_date,
  EXTRACT(DOW FROM publication_date) as day_of_week, -- Should be 1 (Monday)
  TO_CHAR(publication_date, 'Day, DD/MM/YYYY') as formatted_date
FROM editorial_content
ORDER BY year DESC, week_number DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
