CREATE OR REPLACE FUNCTION public.lock_brief_version_text()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.raw_brief IS DISTINCT FROM OLD.raw_brief
     OR NEW.fields IS DISTINCT FROM OLD.fields
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Brief versions are immutable: the brief text cannot be changed. Save a new version instead.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lock_brief_version_text() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lock_brief_version_text ON public.brief_versions;
CREATE TRIGGER lock_brief_version_text BEFORE UPDATE ON public.brief_versions
FOR EACH ROW EXECUTE FUNCTION public.lock_brief_version_text();