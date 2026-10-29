-- Undo for 20261028010000_agent_runs_grants.sql
revoke select, insert on table public.agent_runs from service_role;
