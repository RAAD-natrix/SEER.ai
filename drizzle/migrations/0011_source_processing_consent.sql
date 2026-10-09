ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS processing_consent text NOT NULL DEFAULT 'LOCAL_ONLY';
UPDATE public.sources SET processing_consent = 'ALLOWED_AI' WHERE processing_consent = 'LOCAL_ONLY';
ALTER TABLE public.sources ADD CONSTRAINT sources_processing_consent_check CHECK (processing_consent IN ('LOCAL_ONLY','ALLOWED_AI'));
COMMENT ON COLUMN public.sources.processing_consent IS 'LOCAL_ONLY: never sent to an AI model. ALLOWED_AI: owner permitted AI processing. Existing rows backfilled to ALLOWED_AI because they were already processed.';

CREATE OR REPLACE FUNCTION public.audit_source_consent()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.processing_consent IS DISTINCT FROM OLD.processing_consent) AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.audit_events(owner_id, event, entity, entity_id, detail)
    VALUES (auth.uid(), 'SOURCE_CONSENT', 'source', NEW.id, jsonb_build_object('consent', NEW.processing_consent, 'previous', CASE WHEN TG_OP='UPDATE' THEN OLD.processing_consent END));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_source_consent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_source_consent AFTER INSERT OR UPDATE OF processing_consent ON public.sources FOR EACH ROW EXECUTE FUNCTION public.audit_source_consent();