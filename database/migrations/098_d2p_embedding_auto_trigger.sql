-- =============================================================
-- Migration 098: Auto-generate embedding_d2p via Edge Function
-- Trigger on instagram_leads INSERT/UPDATE of profession/business_category
-- Uses pg_net to call Edge Function asynchronously
-- =============================================================

-- 1. Helper: get project URL from Vault
CREATE OR REPLACE FUNCTION get_project_url()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  url text;
BEGIN
  SELECT decrypted_secret INTO url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url';
  RETURN url;
END;
$$;

-- 2. Trigger function: calls Edge Function via pg_net
CREATE OR REPLACE FUNCTION trigger_generate_d2p_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_url text;
  payload jsonb;
  has_profession boolean;
  has_category boolean;
BEGIN
  -- Only proceed if lead has profession or business_category
  has_profession := (NEW.profession IS NOT NULL AND NEW.profession != '');
  has_category := (NEW.business_category IS NOT NULL AND NEW.business_category != '');

  IF NOT has_profession AND NOT has_category THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if profession or business_category actually changed
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.profession IS NOT DISTINCT FROM NEW.profession)
       AND (OLD.business_category IS NOT DISTINCT FROM NEW.business_category)
       AND (OLD.bio IS NOT DISTINCT FROM NEW.bio) THEN
      RETURN NEW;
    END IF;
  END IF;

  project_url := get_project_url();

  payload := jsonb_build_object(
    'lead_id', NEW.id,
    'profession', NEW.profession,
    'business_category', NEW.business_category,
    'bio', NEW.bio
  );

  -- Async HTTP POST to Edge Function (non-blocking)
  PERFORM net.http_post(
    url := project_url || '/functions/v1/generate-d2p-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := payload,
    timeout_milliseconds := 30000
  );

  RETURN NEW;
END;
$$;

-- 3. Trigger on INSERT
CREATE TRIGGER trg_d2p_embedding_on_insert
  AFTER INSERT ON instagram_leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_d2p_embedding();

-- 4. Trigger on UPDATE of relevant columns
CREATE TRIGGER trg_d2p_embedding_on_update
  AFTER UPDATE OF profession, business_category, bio
  ON instagram_leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_d2p_embedding();
