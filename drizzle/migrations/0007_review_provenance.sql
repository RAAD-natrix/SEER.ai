REVOKE INSERT, UPDATE, DELETE ON public.ai_runs FROM authenticated, anon;
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
CREATE OR REPLACE FUNCTION public.verify_output_review_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE review_stage text; review_json jsonb; require_both boolean;
BEGIN
  require_both := (NEW.approved_at IS NOT NULL OR NEW.status='FINAL — OWNER APPROVED') AND (TG_OP='INSERT' OR OLD.approved_at IS NULL OR NEW.content IS DISTINCT FROM OLD.content OR NEW.version IS DISTINCT FROM OLD.version OR NEW.qa IS DISTINCT FROM OLD.qa OR NEW.redteam IS DISTINCT FROM OLD.redteam);
  FOREACH review_stage IN ARRAY ARRAY['OUTPUT_REDTEAM','OUTPUT_QA'] LOOP
    review_json := CASE WHEN review_stage='OUTPUT_QA' THEN NEW.qa ELSE NEW.redteam END;
    IF review_json IS NOT NULL AND (require_both OR TG_OP='INSERT' OR (review_stage='OUTPUT_QA' AND NEW.qa IS DISTINCT FROM OLD.qa) OR (review_stage='OUTPUT_REDTEAM' AND NEW.redteam IS DISTINCT FROM OLD.redteam)) THEN
      IF NOT EXISTS (SELECT 1 FROM public.ai_runs r WHERE r.status='COMPLETED' AND r.stage=review_stage AND r.case_id=NEW.case_id AND r.input_ids->>'output_id'=NEW.id::text AND r.input_ids->>'output_version'=NEW.version::text AND r.frozen_state->>'reviewed_content'=NEW.content AND r.output=review_json) THEN
        RAISE EXCEPTION 'Review is missing, forged or stale. Run Red Team and QA on this saved version.';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.verify_output_review_provenance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER verify_output_review_provenance BEFORE INSERT OR UPDATE ON public.outputs FOR EACH ROW EXECUTE FUNCTION public.verify_output_review_provenance();
CREATE OR REPLACE FUNCTION public.save_output_version(_output_id uuid, _expected_version integer, _content text, _reason text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_row public.outputs; next_version integer;
BEGIN
  IF NOT public.is_team_member(auth.uid()) THEN RAISE EXCEPTION 'Team access required.'; END IF;
  IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'An edit reason is required.'; END IF;
  SELECT * INTO current_row FROM public.outputs WHERE id=_output_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deliverable not found.'; END IF;
  IF current_row.version<>_expected_version THEN RAISE EXCEPTION 'Deliverable changed. Reload before saving.'; END IF;
  next_version := current_row.version+1;
  UPDATE public.outputs SET content=_content, version=next_version, approved_at=NULL, redteam=NULL, qa=NULL, readiness=NULL, status='NOT READY' WHERE id=_output_id;
  INSERT INTO public.output_versions(owner_id,output_id,version,content,status) VALUES(auth.uid(),_output_id,next_version,_content,'NOT READY');
  INSERT INTO public.audit_events(owner_id,event,entity,entity_id,detail) VALUES(auth.uid(),'OUTPUT_EDITED','output',_output_id,jsonb_build_object('version',next_version,'reason',_reason));
  RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION public.save_output_version(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_output_version(uuid,integer,text,text) TO authenticated,service_role;