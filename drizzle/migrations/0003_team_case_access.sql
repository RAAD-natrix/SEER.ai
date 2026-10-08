CREATE OR REPLACE FUNCTION public.is_team_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ select exists (select 1 from public.user_roles where user_id = _uid and role in ('owner','collaborator')) $$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cases','brief_versions','strategic_state_versions','thought_paths','path_versions','sandbox_messages','sources','evidence_items','claims','options','risks','stakeholders','outputs','output_versions','forecasts','outcome_records','ai_runs'] LOOP
    EXECUTE format('CREATE POLICY "Team reads all cases" ON public.%I FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Team edits all cases" ON public.%I FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()))', t);
  END LOOP;
END $$;
CREATE POLICY "Team reads profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));