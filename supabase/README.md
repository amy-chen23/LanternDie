# Supabase configuration

The existing LanternDie project supplies Auth, private Storage, PostgreSQL and the
scheduled Roboflow detector worker. Current workflow: identification and social
reactions, with historical points retained and new point allocation paused.
See [database rules](../docs/REPORT_OVERHAUL_DATABASE.md) and
[verified migration 19 rollout](../docs/IDENTIFICATION_SOCIAL_ONLY.md).

## Public application configuration

Use `.env.example` at the repository root for the public Supabase URL/anon key.
They initialize the app client and are embedded in its bundle. Server credentials
must not be substituted for that key. Use the existing Auth provider/redirect
configuration described in the [project README](../README.md#authentication-and-profiles).

`report-photos` is private, JPEG-only, at most 5 MiB. `profile-photos` is separate.
Report-photo reads follow accessible reports/ownership. Do not make buckets public
as a workaround for missing UI images. The separate community-avatar policy
migration remains unapplied; report images are not dependent on it.

## Migration history

Migration `20261119000000_identification_social_only.sql` is applied. Its bounded
transaction published three accepted detections, preserved historical credits and
votes, and disabled the retired review APIs. Do not reapply/edit its source or
repair history merely to hide a mismatch.

Inspect `supabase migration list --linked` before an approved database change.
Do not use a bulk `supabase db push`: drafts 16/17/18 are unused/superseded and are
not prerequisites for 19. A new project needs a reviewed, explicit migration plan;
this directory is not an instruction to run every file blindly.

## Existing detector worker

Server-only placeholders are in [functions/.env.example](functions/.env.example).
The worker uses the server-provided Supabase URL/service-role credential to read
private bytes and call service-only processing RPCs. Roboflow configuration:

- `ROBOFLOW_API_KEY`: key authorized for the existing detector/workflow.
- `ROBOFLOW_WORKSPACE` and `ROBOFLOW_WORKFLOW_ID`: both required for workflow mode.
  Optional `ROBOFLOW_WORKFLOW_OUTPUT_KEY` selects a named detection output.
- Alternatively remove both workflow settings and use `ROBOFLOW_MODEL_ID` for a
  direct detector. Partial workflow configuration fails instead of falling back.
- `ROBOFLOW_CLASSES`: exact accepted class names, case-insensitive. Defaults cover
  adult, early nymph and late nymph lanternflies in the checked-in template.
- `ROBOFLOW_DETECTION_THRESHOLD`: default 0.5, valid in `(0,1]`, for identification
  only. It is not an alive/dead probability and is not shown in the results UI.

`process-report-jobs` handles detection with a dedicated `REPORT_WORKER_SECRET`
(at least 32 characters). Its gateway JWT check is off in `config.toml` because
its handler validates that token before work; user/public credentials cannot
claim jobs. `identify-report` keeps JWT verification and Auth/ownership checks
as a compatibility technical-retry endpoint. The app calls the same retry SQL
RPC directly. No browser/native/server alive/dead classifier is part of this flow.

Only when an authorized function/configuration change requires redeployment:

```sh
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy process-report-jobs
supabase functions deploy identify-report
```

The real function `.env` stays ignored. No command above is part of a routine
frontend update. Never print service-role, detector or worker tokens.

## Scheduler and verification

The existing scheduler uses `pg_cron`, `pg_net` and Vault's `project_url` and
`report_worker_secret` names. The Vault worker secret must match the function's
secret. [operations/schedule-report-worker.sql](operations/schedule-report-worker.sql)
sets the once-per-minute due-work trigger. Inspect existing jobs before any
approved scheduling change; do not create duplicate schedules.

[Background processing](../docs/REPORT_PROCESSING_PIPELINE.md) describes leases,
hashes, retries and idempotency limits. [QA handoff](../docs/QA_RELEASE_HANDOFF.md)
separates local mocks/SQL tests from live Auth/Storage/worker checks. Use designated
QA reports when validating the shared hosted project. Do not weaken RLS or expose
private storage to make a test pass.
