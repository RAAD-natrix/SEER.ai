CREATE OR REPLACE FUNCTION public.apply_learning_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('seer.review_apply', 'on', true);
  IF NEW.kind = 'CONTRADICTION' THEN
    UPDATE public.method_rules SET blocking_challenge = true, transfer_payload = NULL, transfer_version = NULL,
      status = CASE WHEN status IN ('CANDIDATE','CANONICAL','STARTER') THEN 'WITHDRAWN' ELSE status END,
      withdrawn_at = CASE WHEN status IN ('CANDIDATE','CANONICAL','STARTER') THEN now() ELSE withdrawn_at END
    WHERE id = NEW.method_rule_id;
  ELSIF NEW.kind = 'RESOLUTION' THEN
    UPDATE public.method_rules SET blocking_challenge = false WHERE id = NEW.method_rule_id;
  END IF;
  PERFORM set_config('seer.review_apply', 'off', true);
  INSERT INTO public.audit_events(owner_id, event, entity, entity_id, detail)
    VALUES (NEW.owner_id, 'METHOD_' || NEW.kind, 'method_rule', NEW.method_rule_id, jsonb_build_object('version', NEW.rule_version, 'outcome', NEW.outcome, 'review_id', NEW.id));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.govern_method_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE last_contra timestamptz; payload jsonb; txt text; governed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('CANDIDATE','CANONICAL','WITHDRAWN') THEN NEW.status := 'PENDING_REVIEW'; END IF;
    NEW.transfer_payload := NULL; NEW.transfer_version := NULL; NEW.blocking_challenge := false;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('seer.review_apply', true), 'off') <> 'on' THEN NEW.blocking_challenge := OLD.blocking_challenge; END IF;
  IF (NEW.name, NEW.problem_type, NEW.mechanism, NEW.why_useful, NEW.prerequisites, NEW.use_when, NEW.do_not_use_when, NEW.counterexamples, NEW.required_evidence, NEW.falsifier)
     IS DISTINCT FROM (OLD.name, OLD.problem_type, OLD.mechanism, OLD.why_useful, OLD.prerequisites, OLD.use_when, OLD.do_not_use_when, OLD.counterexamples, OLD.required_evidence, OLD.falsifier) THEN
    NEW.version := OLD.version + 1;
    NEW.transfer_payload := NULL; NEW.transfer_version := NULL;
    IF NEW.status IN ('CANDIDATE','CANONICAL') THEN NEW.status := 'PENDING_REVIEW'; END IF;
  ELSE
    NEW.version := OLD.version;
  END IF;
  IF NEW.status = 'WITHDRAWN' AND OLD.status <> 'WITHDRAWN' AND NEW.withdrawn_at IS NULL THEN NEW.withdrawn_at := now(); END IF;

  governed := NEW.status IN ('CANDIDATE','CANONICAL') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.version <> OLD.version);
  IF governed THEN
    IF auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Only the memory owner may activate a method.'; END IF;
    IF NEW.blocking_challenge THEN RAISE EXCEPTION 'An open contradiction blocks activation. Resolve it, then re-challenge and re-validate.'; END IF;
    SELECT max(created_at) INTO last_contra FROM public.learning_reviews WHERE method_rule_id = NEW.id AND kind = 'CONTRADICTION';
    IF NOT EXISTS (SELECT 1 FROM public.learning_reviews WHERE method_rule_id = NEW.id AND rule_version = NEW.version AND kind = 'CHALLENGE' AND created_at > coalesce(last_contra, '-infinity')) THEN
      RAISE EXCEPTION 'Activation requires a documented challenge of version %.', NEW.version; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.learning_reviews WHERE method_rule_id = NEW.id AND rule_version = NEW.version AND kind = 'VALIDATION' AND outcome = 'PASS' AND created_at > coalesce(last_contra, '-infinity')) THEN
      RAISE EXCEPTION 'Activation requires a passing validation with boundaries for version %.', NEW.version; END IF;
    IF (SELECT outcome FROM public.learning_reviews WHERE method_rule_id = NEW.id AND rule_version = NEW.version AND kind = 'VALIDATION' ORDER BY created_at DESC LIMIT 1) = 'FAIL' THEN
      RAISE EXCEPTION 'The latest validation of this version failed.'; END IF;
  END IF;

  IF NEW.status = 'CANONICAL' THEN
    IF governed THEN
      IF (SELECT outcome FROM public.learning_reviews WHERE method_rule_id = NEW.id AND rule_version = NEW.version AND kind = 'TRANSFER_REVIEW' AND created_at > coalesce(last_contra, '-infinity') ORDER BY created_at DESC LIMIT 1) IS DISTINCT FROM 'PASS' THEN
        RAISE EXCEPTION 'Cross-project use requires a passing generic-transfer review of version %.', NEW.version; END IF;
      IF NEW.contamination IS NOT NULL AND coalesce((NEW.contamination->>'blocked')::boolean, false) THEN RAISE EXCEPTION 'The contamination scan blocks transfer.'; END IF;
      payload := public.method_transfer_payload(NEW);
      SELECT string_agg(value, ' ') INTO txt FROM jsonb_each_text(payload);
      IF coalesce(txt,'') ~ '[0-9]' OR coalesce(txt,'') ~* '(https?://|www\.|@)' THEN
        RAISE EXCEPTION 'Transfer screening failed: remove digits, links or addresses from the six generic fields.'; END IF;
      NEW.transfer_payload := payload; NEW.transfer_version := NEW.version;
    ELSE
      NEW.transfer_payload := OLD.transfer_payload; NEW.transfer_version := OLD.transfer_version;
    END IF;
  ELSE
    NEW.transfer_payload := NULL; NEW.transfer_version := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_learning_review(), public.govern_method_rule() FROM PUBLIC, anon;