CREATE TABLE public.team_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, invited_by uuid NOT NULL DEFAULT auth.uid(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'), consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invitations TO authenticated;
GRANT ALL ON public.team_invitations TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages invitations" ON public.team_invitations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing int; allowed boolean; invitation uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(740019);
  SELECT count(*) INTO existing FROM public.profiles;
  SELECT allow_signup INTO allowed FROM public.app_config WHERE id = 1;
  IF existing > 0 THEN
    SELECT id INTO invitation FROM public.team_invitations WHERE lower(email)=lower(new.email) AND consumed_at IS NULL AND expires_at > now() FOR UPDATE;
    IF NOT coalesce(allowed,false) OR invitation IS NULL THEN RAISE EXCEPTION 'SEER.ai is private. An active email invitation is required.'; END IF;
    UPDATE public.team_invitations SET consumed_at=now() WHERE id=invitation;
  END IF;
  INSERT INTO public.profiles (id,display_name) VALUES (new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)));
  INSERT INTO public.user_roles (user_id,role) VALUES (new.id,CASE WHEN existing=0 THEN 'owner'::public.app_role ELSE 'collaborator'::public.app_role END);
  PERFORM public.seed_method_starters(new.id);
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_output_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.approved_at IS NOT NULL AND NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only the owner may change an approved deliverable.'; END IF;
  IF NEW.approved_at IS NOT NULL OR NEW.status='FINAL — OWNER APPROVED' THEN
    IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only the owner may approve a deliverable.'; END IF;
    IF NEW.approved_at IS NULL OR NEW.redteam IS NULL OR NEW.qa IS NULL OR NEW.readiness IS NULL THEN RAISE EXCEPTION 'Approval requires Red Team, QA and readiness.'; END IF;
    IF jsonb_array_length(coalesce(NEW.redteam->'fatal','[]'::jsonb))>0 OR jsonb_array_length(coalesce(NEW.readiness->'blockers','[]'::jsonb))>0 OR coalesce((NEW.qa->>'duplication_found')::boolean,true) OR coalesce((NEW.readiness->>'canBeFinal')::boolean,false)=false THEN RAISE EXCEPTION 'Approval blocked by review or readiness findings.'; END IF;
    IF jsonb_array_length(coalesce(NEW.qa->'checks','[]'::jsonb))=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.qa->'checks') c WHERE coalesce((c->>'pass')::boolean,false)=false) THEN RAISE EXCEPTION 'Every QA check must pass before approval.'; END IF;
    IF TG_OP='UPDATE' AND NEW.content IS DISTINCT FROM OLD.content THEN RAISE EXCEPTION 'Save edits and rerun reviews before approval.'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.version IS DISTINCT FROM OLD.version) THEN
    NEW.redteam=NULL; NEW.qa=NULL; NEW.approved_at=NULL; NEW.status='NOT READY';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_output_approval() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_output_approval BEFORE INSERT OR UPDATE ON public.outputs FOR EACH ROW EXECUTE FUNCTION public.guard_output_approval();
CREATE OR REPLACE FUNCTION public.audit_signup_setting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.allow_signup IS DISTINCT FROM OLD.allow_signup AND auth.uid() IS NOT NULL THEN INSERT INTO public.audit_events(owner_id,event,entity,detail) VALUES(auth.uid(),'SIGNUP_ACCESS_CHANGED','app_config',jsonb_build_object('open',NEW.allow_signup)); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_signup_setting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_signup_setting AFTER UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.audit_signup_setting();
CREATE POLICY "Team reads case research files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='sources' AND public.is_team_member(auth.uid()) AND EXISTS (SELECT 1 FROM public.sources s WHERE s.storage_path=name AND s.case_id IS NOT NULL AND s.area='research' AND s.deleted_at IS NULL));