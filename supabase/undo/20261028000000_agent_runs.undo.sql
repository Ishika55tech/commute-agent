-- Undo for 20261028000000_agent_runs.sql
drop index if exists public.agent_runs_created_at_idx;
drop table if exists public.agent_runs;
