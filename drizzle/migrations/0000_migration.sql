
create type public.app_role as enum ('owner','collaborator','viewer');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  workspace_name text,
  language text not null default 'en-GB',
  onboarded boolean not null default false,
  settings jsonb not null default '{"work_depth":"STANDARD","cross_case_retrieval":true,"candidate_memory":true,"max_upload_mb":20}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create table public.app_config (
  id int primary key default 1 check (id = 1),
  allow_signup boolean not null default false,
  app_version text not null default '7.0.0',
  prompt_version text not null default 'charter-v1',
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (1);
grant select, update on public.app_config to authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
create policy "config read" on public.app_config for select to authenticated using (true);
create policy "config owner update" on public.app_config for update to authenticated using (public.has_role(auth.uid(),'owner'));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null,
  client text,
  engagement_mode text not null default 'CLIENT WORK',
  status text not null default 'ACTIVE',
  stage text not null default 'BRIEF',
  active_path_id uuid,
  fields jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brief_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  version int not null,
  raw_brief text not null default '',
  fields jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  triage jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, version)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid references public.cases(id) on delete cascade,
  area text not null check (area in ('think','research','openmind')),
  title text not null,
  filename text,
  mime text,
  file_hash text,
  size_bytes bigint,
  source_type text,
  classification text,
  confidentiality text not null default 'CONFIDENTIAL',
  status text not null default 'UPLOADED',
  coverage jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  storage_path text,
  extracted_text text,
  source_date text,
  reliability_notes text,
  review jsonb,
  delta jsonb,
  routing text,
  path_ids uuid[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.thought_paths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  thesis text not null default '',
  status text not null default 'OPEN',
  parent_ids uuid[] not null default '{}',
  merged_from uuid[] not null default '{}',
  version int not null default 1,
  detail jsonb not null default '{}'::jsonb,
  conclusion jsonb,
  closed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.path_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  path_id uuid not null references public.thought_paths(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.sandbox_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  path_id uuid not null references public.thought_paths(id) on delete cascade,
  role text not null check (role in ('owner','seer')),
  kind text not null default 'THOUGHT',
  content text not null,
  basis jsonb,
  prior_learning jsonb,
  actions jsonb not null default '[]'::jsonb,
  ai_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strategic_state_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  version int not null,
  state jsonb not null,
  reason text,
  ai_run_id uuid,
  created_at timestamptz not null default now(),
  unique (case_id, version)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  statement text not null,
  source_id uuid references public.sources(id) on delete set null,
  source_label text,
  source_type text,
  classification text not null default 'REPORTED',
  direction text not null default 'NEUTRAL',
  strength int not null default 3 check (strength between 1 and 5),
  reliability numeric not null default 0.5 check (reliability between 0.20 and 0.95),
  independence numeric not null default 1 check (independence between 0.25 and 1.00),
  period text,
  limitation text,
  path_ids uuid[] not null default '{}',
  claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  claim text not null,
  confidence text,
  permitted_wording text not null default 'DO NOT STATE AS FACT',
  falsifier text,
  best_additional_evidence text,
  path_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  label text not null,
  description text,
  scores jsonb not null default '{}'::jsonb,
  hard_constraint_fail boolean not null default false,
  assumptions text,
  switching_conditions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  risk text not null,
  likelihood text,
  consequence text,
  control text,
  risk_owner text,
  trigger_condition text,
  severity text not null default 'MATERIAL',
  path_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stakeholders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  name text not null,
  influence text, alignment text, gain text, loss text,
  likely_response text, resistance text, info_gap text, required_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  template_key text not null,
  title text not null,
  status text not null default 'NOT READY',
  content text not null default '',
  version int not null default 1,
  readiness jsonb,
  redteam jsonb,
  qa jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.output_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  output_id uuid not null references public.outputs(id) on delete cascade,
  version int not null,
  content text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  expected_result text not null,
  baseline text, population text, metric text, unit text, horizon text,
  assumptions text, conditions text,
  created_at timestamptz not null default now()
);

create table public.outcome_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  forecast_id uuid references public.forecasts(id) on delete set null,
  actual_result text not null,
  evidence text, fidelity text, external_changes text, attribution_limits text,
  adoption text, usefulness int check (usefulness between 1 and 5),
  seer_wrong text, seer_understood text, owner_changed text, retain text,
  created_at timestamptz not null default now()
);

create table public.method_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  memory_class text not null default 'METHOD',
  status text not null default 'CANDIDATE',
  problem_type text,
  mechanism text,
  why_useful text,
  prerequisites text,
  use_when text,
  do_not_use_when text,
  counterexamples text,
  required_evidence text,
  falsifier text,
  tags text[] not null default '{}',
  contamination jsonb,
  source_ids uuid[] not null default '{}',
  case_id uuid,
  version int not null default 1,
  superseded_by uuid,
  confidentiality_scope text not null default 'GENERAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid references public.cases(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  event_type text not null,
  context text,
  previous_proposition text,
  owner_response text,
  revised_proposition text,
  reason text,
  method_rule_id uuid references public.method_rules(id) on delete set null,
  confirmed boolean not null default false,
  scope text not null default 'CASE',
  created_at timestamptz not null default now()
);

create table public.openmind_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  kind text not null default 'OWNER THOUGHT',
  title text,
  content text not null,
  url text,
  reusable boolean not null default false,
  parent_id uuid references public.openmind_items(id) on delete set null,
  source_id uuid references public.sources(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  method_rule_id uuid references public.method_rules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid,
  path_id uuid,
  stage text not null,
  prompt_version text not null,
  model text,
  status text not null default 'RUNNING',
  input_ids jsonb,
  retrieved_method_ids uuid[] not null default '{}',
  frozen_state jsonb,
  output jsonb,
  error text,
  usage jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  event text not null,
  entity text,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  scope text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cases','brief_versions','sources','thought_paths','sandbox_messages','evidence_items','claims','options','risks','stakeholders','outputs','method_rules','openmind_items','ai_runs','saved_views'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner all" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
  foreach t in array array['path_versions','strategic_state_versions','output_versions','forecasts','outcome_records','learning_events','audit_events'] loop
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (owner_id = auth.uid())', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (owner_id = auth.uid())', t);
  end loop;
  foreach t in array array['profiles','cases','brief_versions','sources','thought_paths','sandbox_messages','evidence_items','claims','options','risks','stakeholders','outputs','method_rules','openmind_items'] loop
    execute format('create trigger touch_%s before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

grant update (confirmed) on public.learning_events to authenticated;
create policy "owner confirm" on public.learning_events for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.seed_method_starters(_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.method_rules (owner_id, name, status, mechanism, use_when, do_not_use_when, tags) values
  (_uid,'Mandate plus expansion','STARTER','Satisfy the mandatory assignment visibly before expanding the problem strategically.','The brief is narrow but the underlying problem appears wider.','Strategic expansion would be used to evade the actual brief.','{brief,scope}'),
  (_uid,'Investigate the system around the brief','STARTER','Before solving the visible issue, inspect the actors, rules, incentives, history, interfaces and constraints that may be generating it.','A visible issue may be a symptom of a wider system.','The issue is genuinely isolated and well evidenced.','{diagnosis,system}'),
  (_uid,'Change the unit of value','STARTER','When conventional metrics obscure the human or commercial outcome, test whether reframing the unit of value reveals a better solution.','Conventional metrics hide the real outcome.','The reframe would obscure real price, rights, economics or utility.','{value,reframe}'),
  (_uid,'Temporal reversal','STARTER','Ask whether value is arriving too late or intervention is occurring at the wrong point in the relationship.','Timing of value or intervention looks misaligned.','Economics and usefulness of earlier delivery have not been tested; earlier is not automatically better.','{timing}'),
  (_uid,'Latent capability recombination','STARTER','Test whether existing assets, permissions, moments, channels or capabilities can be recombined before assuming a new asset must be built.','A new asset is being proposed.','Existing capabilities are demonstrably unfit.','{assets,capability}'),
  (_uid,'Mechanism design under constraint','STARTER','When direct identification, control or data is unavailable, examine voluntary, incentive-compatible or structurally simpler mechanisms.','A hard constraint blocks the obvious route.','The constraint can realistically be removed.','{mechanism,constraint}'),
  (_uid,'Complement the customer''s anchor','STARTER','Test whether the current behaviour is rational, valued or commercially important and whether the new route can complement it.','A strategy wants to replace an existing behaviour.','The existing behaviour is demonstrably harmful or uneconomic.','{behaviour,customer}'),
  (_uid,'Remove the accessories','STARTER','Strip away novelty, incentives, naming, technology or spectacle and ask whether the underlying proposition still has value.','A proposition relies on novelty or spectacle.','Removal would destroy the actual mechanism; record that distinction.','{proposition}'),
  (_uid,'Follow the idea into operations','STARTER','Explain who chooses, who acts, who pays, what is delivered, what data is created, what can fail and who owns the failure.','Any concept heading towards a recommendation.','Pure exploratory thinking not yet proposed.','{operations,implementation}'),
  (_uid,'One governing proposition, adaptable manifestations','STARTER','Prefer a coherent governing logic where manifestations genuinely express the same strategy.','Multiple audiences or businesses share a strategic logic.','Businesses or audiences require genuinely different propositions.','{proposition,architecture}'),
  (_uid,'Operational truth and separate ownership','STARTER','Where multiple systems hold money, permissions, promises, points, inventory, identity or responsibility, keep ownership and ledgers explicit.','Several systems share obligations.','A single system genuinely owns everything.','{operations,ledger}'),
  (_uid,'Mechanism before expression','STARTER','Creative and presentation devices should demonstrate the strategic mechanism; decoration must not substitute for a real job.','Communications or creative work is being shaped.','No strategic mechanism yet exists to express.','{expression}'),
  (_uid,'Disprove, measure, retain learning','STARTER','Every consequential idea needs a way to fail, a baseline, an observable outcome, an owner, a review condition and a retention rule.','Any consequential idea or pilot.','Trivial, reversible actions.','{measurement,validation}');
end $$;
revoke execute on function public.seed_method_starters(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare existing int; allowed boolean;
begin
  select count(*) into existing from public.profiles;
  select allow_signup into allowed from public.app_config where id = 1;
  if existing > 0 and not coalesce(allowed,false) then
    raise exception 'SEER.ai is private and invite-only. Sign-up is closed.';
  end if;
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if existing = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'collaborator');
  end if;
  perform public.seed_method_starters(new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create policy "own source files read" on storage.objects for select to authenticated using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own source files insert" on storage.objects for insert to authenticated with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own source files delete" on storage.objects for delete to authenticated using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
