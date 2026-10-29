-- The project was created with "Automatically expose new tables" OFF, so no
-- role had privileges on agent_runs. The Edge Function writes as service_role.
-- anon/authenticated stay without any privileges (plus RLS with no policies).
grant select, insert on table public.agent_runs to service_role;
