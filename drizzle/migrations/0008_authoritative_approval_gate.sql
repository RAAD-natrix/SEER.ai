CREATE OR REPLACE FUNCTION public.saved_output_readiness(_case_id uuid, _template text, _redteam jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE f jsonb; s jsonb; ev int; prov int; contra int; opts int; closed int; owned int; blockers jsonb := '[]';
BEGIN
 SELECT fields INTO f FROM public.cases WHERE id=_case_id AND deleted_at IS NULL;
 IF f IS NULL THEN RAISE EXCEPTION 'Active case not found.'; END IF;
 SELECT state INTO s FROM public.strategic_state_versions WHERE case_id=_case_id ORDER BY version DESC LIMIT 1;
 SELECT count(*),count(*) FILTER (WHERE source_id IS NOT NULL OR nullif(trim(source_label),'') IS NOT NULL),count(*) FILTER (WHERE direction='CONTRADICTS') INTO ev,prov,contra FROM public.evidence_items WHERE case_id=_case_id;
 SELECT count(*) INTO opts FROM public.options WHERE case_id=_case_id AND NOT hard_constraint_fail;
 SELECT count(*) INTO closed FROM public.thought_paths WHERE case_id=_case_id AND status='CLOSED';
 SELECT count(*) INTO owned FROM public.risks WHERE case_id=_case_id AND nullif(trim(risk_owner),'') IS NOT NULL;
 IF coalesce(nullif(trim(f->>'decision'),''),nullif(trim(s->>'question_to_answer'),'')) IS NULL THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','No clear question/decision','cap',35)); END IF;
 IF ev=0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','No meaningful evidence','cap',25)); END IF;
 IF _template IN ('judgement_note','decision_paper','options_paper','business_case') AND opts<2 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','No credible alternatives where a decision is required','cap',60)); END IF;
 IF _template IN ('blueprint','pilot_design','operating_module','control_ledger') AND owned=0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','Implementation output without owners/dependencies','cap',65)); END IF;
 IF closed=0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','No closed/selected thought path','cap',80)); END IF;
 IF jsonb_typeof(_redteam->'fatal') IS DISTINCT FROM 'array' OR jsonb_typeof(_redteam->'material') IS DISTINCT FROM 'array' THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','Missing or invalid Red Team findings','cap',0));
 ELSE
 IF jsonb_array_length(_redteam->'fatal')>0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','Open fatal Red Team issue','cap',50)); END IF;
 IF jsonb_array_length(_redteam->'material')>0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('label','Unresolved material Red Team findings — revise and re-review','cap',65)); END IF;
 END IF;
 RETURN jsonb_build_object('blockers',blockers,'canBeFinal',jsonb_array_length(blockers)=0,'authority','saved-record-gate-v1','evidence_count',ev,'provenance_count',prov,'contradicting_count',contra,'credible_options',opts,'closed_paths',closed,'owned_risks',owned);
END $$;
REVOKE ALL ON FUNCTION public.saved_output_readiness(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_output_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE gate jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.approved_at IS NOT NULL AND NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only the owner may change an approved deliverable.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.version IS DISTINCT FROM OLD.version) THEN
  IF NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Save edits and rerun reviews before approval.'; END IF;
  NEW.redteam=NULL; NEW.qa=NULL; NEW.approved_at=NULL; NEW.readiness=NULL; NEW.status='NOT READY';
 END IF;
 IF NEW.approved_at IS NOT NULL OR NEW.status='FINAL — OWNER APPROVED' THEN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only the owner may approve a deliverable.'; END IF;
  IF NEW.approved_at IS NULL OR NEW.redteam IS NULL OR NEW.qa IS NULL THEN RAISE EXCEPTION 'Approval requires Red Team and QA.'; END IF;
  IF TG_OP='UPDATE' AND OLD.approved_at IS NOT NULL AND NEW.content=OLD.content AND NEW.version=OLD.version AND NEW.qa IS NOT DISTINCT FROM OLD.qa AND NEW.redteam IS NOT DISTINCT FROM OLD.redteam AND NEW.readiness IS NOT DISTINCT FROM OLD.readiness AND NEW.status=OLD.status AND NEW.approved_at=OLD.approved_at THEN RETURN NEW; END IF;
  gate:=public.saved_output_readiness(NEW.case_id,NEW.template_key,NEW.redteam);
  IF NOT (gate->>'canBeFinal')::boolean THEN RAISE EXCEPTION 'Approval blocked by saved-record gate: %',gate->'blockers'; END IF;
  IF jsonb_typeof(NEW.qa->'checks') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.qa->'duplication_found') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid QA result.'; END IF;
  IF jsonb_array_length(NEW.qa->'checks')=0 OR (NEW.qa->>'duplication_found')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.qa->'checks') c WHERE c->'pass' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Every QA check must pass before approval.'; END IF;
  NEW.readiness:=jsonb_build_object('authority','saved-record-gate-v1','blockers',gate->'blockers','canBeFinal',true,'saved_record_gate',gate);
  NEW.status:='FINAL — OWNER APPROVED';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_output_approval() FROM PUBLIC,anon,authenticated;