-- Run in the intended hosted project AFTER deploying process-report-jobs.
-- Enable pg_cron and pg_net in the Supabase dashboard first.
-- Create these Vault secrets through the dashboard (never commit actual values):
--   project_url: https://YOUR_PROJECT_REF.supabase.co
--   report_worker_secret: same >=32-character token as REPORT_WORKER_SECRET
-- The worker uses this dedicated token, NOT a public user API key.
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='project_url')
 or not exists(select 1 from vault.decrypted_secrets where name='report_worker_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configure project_url and report_worker_secret in Vault first'; end if;
end$$;
select cron.schedule('process-report-jobs','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/process-report-jobs',
  headers := jsonb_build_object('Content-Type','application/json',
   'x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='report_worker_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 55000
 ) where exists(select 1 from public.report_processing_jobs
  where (status in ('queued','retry') and available_at<=now()) or (status='running' and lease_until<=now()));
$job$);
-- Stop scheduling with: select cron.unschedule('process-report-jobs');
