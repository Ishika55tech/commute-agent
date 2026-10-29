-- Audit log of every LLM call made by the parse-commute Edge Function.
-- Written only by the Edge Function (service role). RLS is ON with no
-- policies, so the public anon key can neither read nor write it.

create table if not exists public.agent_runs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  function_name text        not null,
  input_text    text        not null check (char_length(input_text) <= 500),
  output_json   jsonb,
  error         text,
  model         text,
  latency_ms    integer
);

alter table public.agent_runs enable row level security;

create index if not exists agent_runs_created_at_idx on public.agent_runs (created_at desc);
