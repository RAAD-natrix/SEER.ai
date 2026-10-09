ALTER TABLE public.method_rules
  ADD COLUMN IF NOT EXISTS transfer_payload jsonb,
  ADD COLUMN IF NOT EXISTS transfer_version integer,
  ADD COLUMN IF NOT EXISTS blocking_challenge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

CREATE TABLE public.learning_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  method_rule_id uuid NOT NULL REFERENCES public.method_rules(id) ON DELETE CASCADE,
  rule_version integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('CHALLENGE','VALIDATION','TRANSFER_REVIEW','SUPPORT','CONTRADICTION','RESOLUTION')),
  outcome text NOT NULL DEFAULT 'NOTED' CHECK (outcome IN ('PASS','FAIL','NOTED')),
  notes text NOT NULL CHECK (length(trim(notes)) > 0),
  boundaries text,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  outcome_record_id uuid REFERENCES public.outcome_records(id) ON DELETE SET NULL,
  ai_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.learning_reviews TO authenticated;
GRANT ALL ON public.learning_reviews TO service_role;
ALTER TABLE public.learning_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads reviews" ON public.learning_reviews FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner records reviews" ON public.learning_reviews FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.method_rules m WHERE m.id = method_rule_id AND m.owner_id = auth.uid()));
CREATE INDEX learning_reviews_rule_idx ON public.learning_reviews(method_rule_id, rule_version);

CREATE OR REPLACE FUNCTION public.method_transfer_payload(m public.method_rules)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('title', m.name, 'problem', m.problem_type, 'mechanism', m.mechanism,
    'applies_when', m.use_when, 'avoid_when', m.do_not_use_when, 'required_evidence', m.required_evidence)
$$;

CREATE OR REPLACE FUNCTION public.stamp_learning_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.method_rules;
BEGIN
  SELECT * INTO r FROM public.method_rules WHERE id = NEW.method_rule_id FOR UPDATE;
  IF NOT FOUND OR r.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Only the memory owner may review this method.'; END IF;
  NEW.rule_version := r.version;
  NEW.owner_id := auth.uid();
  NEW.created_at := now();
  IF NEW.kind IN ('VALIDATION','TRANSFER_REVIEW') AND NEW.outcome = 'NOTED' THEN RAISE EXCEPTION 'Validation and transfer reviews must pass or fail.'; END IF;
  IF NEW.kind = 'VALIDATION' AND NEW.outcome = 'PASS' AND nullif(trim(coalesce(NEW.boundaries,'')),'') IS NULL THEN RAISE EXCEPTION 'A passing validation must state its boundaries.'; END IF;
  IF NEW.kind = 'CONTRADICTION' AND NEW.outcome_record_id IS NULL AND NEW.case_id IS NULL THEN RAISE EXCEPTION 'A contradiction must cite a case or recorded outcome.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stamp_learning_review BEFORE INSERT ON public.learning_reviews FOR EACH ROW EXECUTE FUNCTION public.stamp_learning_review();

CREATE OR REPLACE FUNCTION public.apply_learning_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.kind = 'CONTRADICTION' THEN
    UPDATE public.method_rules SET blocking_challenge = true, transfer_payload = NULL, transfer_version = NULL,
      status = CASE WHEN status IN ('CANDIDATE','CANONICAL','STARTER') THEN 'WITHDRAWN' ELSE status END,
      withdrawn_at = CASE WHEN status IN ('CANDIDATE','CANONICAL','STARTER') THEN now() ELSE withdrawn_at END
    WHERE id = NEW.method_rule_id;
  ELSIF NEW.kind = 'RESOLUTION' THEN
    UPDATE public.method_rules SET blocking_challenge = false WHERE id = NEW.method_rule_id;
  END IF;
  INSERT INTO public.audit_events(owner_id, event, entity, entity_id, detail)
    VALUES (NEW.owner_id, 'METHOD_' || NEW.kind, 'method_rule', NEW.method_rule_id, jsonb_build_object('version', NEW.rule_version, 'outcome', NEW.outcome, 'review_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER apply_learning_review AFTER INSERT ON public.learning_reviews FOR EACH ROW EXECUTE FUNCTION public.apply_learning_review();

CREATE OR REPLACE FUNCTION public.govern_method_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE last_contra timestamptz; payload jsonb; txt text; governed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('CANDIDATE','CANONICAL','WITHDRAWN') THEN NEW.status := 'PENDING_REVIEW'; END IF;
    NEW.transfer_payload := NULL; NEW.transfer_version := NULL; NEW.blocking_challenge := false;
    RETURN NEW;
  END IF;
  -- Revision invalidation: any substantive edit is a new version needing fresh review.
  IF (NEW.name, NEW.problem_type, NEW.mechanism, NEW.why_useful, NEW.prerequisites, NEW.use_when, NEW.do_not_use_when, NEW.counterexamples, NEW.required_evidence, NEW.falsifier)
     IS DISTINCT FROM (OLD.name, OLD.problem_type, OLD.mechanism, OLD.why_useful, OLD.prerequisites, OLD.use_when, OLD.do_not_use_when, OLD.counterexamples, OLD.required_evidence, OLD.falsifier) THEN
    NEW.version := OLD.version + 1;
    NEW.transfer_payload := NULL; NEW.transfer_version := NULL;
    IF NEW.status IN ('CANDIDATE','CANONICAL') THEN NEW.status := 'PENDING_REVIEW'; END IF;
  ELSE
    NEW.version := OLD.version;
  END IF;
  NEW.blocking_challenge := OLD.blocking_challenge OR false;
  IF current_setting('seer.review_apply', true) IS NULL THEN NULL; END IF;
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
    IF EXISTS (SELECT 1 FROM public.learning_reviews v WHERE v.method_rule_id = NEW.id AND v.rule_version = NEW.version AND v.kind = 'VALIDATION' AND v.outcome = 'FAIL'
               AND v.created_at > (SELECT max(p.created_at) FROM public.learning_reviews p WHERE p.method_rule_id = NEW.id AND p.rule_version = NEW.version AND p.kind = 'VALIDATION' AND p.outcome = 'PASS')) THEN
      RAISE EXCEPTION 'The latest validation of this version failed.'; END IF;
  END IF;

  IF NEW.status = 'CANONICAL' THEN
    IF governed THEN
      IF NOT EXISTS (SELECT 1 FROM public.learning_reviews WHERE method_rule_id = NEW.id AND rule_version = NEW.version AND kind = 'TRANSFER_REVIEW' AND outcome = 'PASS' AND created_at > coalesce(last_contra, '-infinity')) THEN
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
CREATE TRIGGER govern_method_rule BEFORE INSERT OR UPDATE ON public.method_rules FOR EACH ROW EXECUTE FUNCTION public.govern_method_rule();

REVOKE EXECUTE ON FUNCTION public.stamp_learning_review(), public.apply_learning_review(), public.govern_method_rule() FROM PUBLIC, anon;