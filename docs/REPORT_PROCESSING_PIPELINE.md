# Background lanternfly detection

The current application uses the existing scheduled Roboflow detector worker.
There is no alive/dead inference or human life-status approval stage.
See [verified workflow rollout](IDENTIFICATION_SOCIAL_ONLY.md).

## Flow

1. The app normalizes the selected photo to JPEG, longest edge at most 1600 pixels,
   quality 0.75 and at most 5 MiB, then uploads to private `report-photos` storage.
2. Inserting the report enqueues `report_processing_jobs` in the same transaction.
   The upload must finish before that durable job exists. Leaving the screen after
   saving does not cancel the job; resumable uploads are not implemented.
3. `process-report-jobs` claims an eligible job with `FOR UPDATE SKIP LOCKED` and a
   random two-minute lease. It downloads the stored bytes and computes SHA256.
   `prepare_report_processing` rejects exact duplicates before a detector call.
4. Roboflow runs with a 45-second timeout. Existing class filtering and geometry
   validation produce a stored detector snapshot and initialized insect boxes.
5. Hash-registered, accepted detections with a complete active box set publish
   without an alive/dead decision. Empty detections stay out of the feed.
   Publication and social votes do not allocate new points.
6. The app displays counts and numbered boxes. Owner status polling runs every
   ten seconds during foreground processing; feed refreshes are quiet. Photo URLs
   are signed/cached instead of downloading all image bytes before rendering.

## Recovery and access

- Retryable failures back off 1, 2, 4, then 8 minutes; at most five actual detector
  attempts. An extra exhausted-job claim finalizes failure without another call.
- Prepare/complete/fail operations fence stale or expired leases. Expired jobs
  can be reclaimed by the scheduler.
- Terminal technical failures remain in the owner's retry flow, with the existing
  fifteen-minute cooldown. They do not request admin review. Completed empty
  detections and duplicates are not reopened through the technical retry API.
- Ordinary clients cannot claim jobs, register trusted hashes or save detector
  results. Private storage/RLS protects reports and processing status.
- Referenced photo bytes cannot be replaced. Owners delete their report first;
  storage cleanup then removes the orphan file. Hash tombstones remain.
- Upstream detector HTTP is at least once: a crash after the response but before
  SQL completion can cause a repeated call. No exactly-once usage claim is made.

## Existing worker configuration

Use [the server configuration guide](../supabase/README.md) and the placeholder-only
[environment template](../supabase/functions/.env.example). Roboflow and worker
credentials are server-only. `identify-report` is a compatibility owner-retry
endpoint; the app calls `retry_report_processing` directly.

The existing scheduler uses `pg_cron`, `pg_net` and Vault secrets `project_url` and
`report_worker_secret`. The worker's `REPORT_WORKER_SECRET` must match the Vault
value and contain at least 32 characters. The checked-in
[scheduler SQL](../supabase/operations/schedule-report-worker.sql) schedules one job
per minute when due work exists. Do not run setup/deployment commands as a routine
client update; inspect the existing configuration before an approved change.

## Checks

`npm test` covers the worker/parser/status helpers. Database fixtures include
[processing access](../tests/report-processing-access.sql) and
[identification/social flow](../tests/identification-social-access.sql). Use a
separate disposable PostgreSQL database: these fixtures create roles/schema.
Deno typechecking covers both Edge-function entry points. Live upload/worker tests
use the configured shared project and real detector, unlike mocked browser tests.
