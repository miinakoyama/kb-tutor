create table if not exists public.assignment_question_snapshots (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null references public.assignments(id) on delete cascade,
  order_index int not null,
  question_id text not null,
  source_type text not null check (source_type in ('existing_set', 'generated_now', 'manual')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (assignment_id, order_index)
);

create index if not exists idx_assignment_question_snapshots_assignment
  on public.assignment_question_snapshots(assignment_id, order_index);
