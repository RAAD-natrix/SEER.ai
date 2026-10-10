create table public.case_chat_threads (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.case_chat_threads(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  role text not null check (role in ('user','assistant')),
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index case_chat_threads_case_idx on public.case_chat_threads(case_id, updated_at desc);
create index case_chat_messages_thread_idx on public.case_chat_messages(thread_id, created_at asc);

grant select, insert, update, delete on public.case_chat_threads to authenticated;
grant all on public.case_chat_threads to service_role;
grant select, insert, update, delete on public.case_chat_messages to authenticated;
grant all on public.case_chat_messages to service_role;

alter table public.case_chat_threads enable row level security;
alter table public.case_chat_messages enable row level security;

create policy "owner all" on public.case_chat_threads for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all" on public.case_chat_messages for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());