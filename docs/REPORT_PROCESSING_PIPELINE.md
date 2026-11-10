# Background report upload pipeline

> Deployment update (November 9, 2026): database migrations have been applied to
> LanternDie. Worker, scheduler, and hosted-client deployment remain pending.
> See [current rollout status](REPORT_OVERHAUL_ROLLOUT.md); implementation-time
> statements below about the shared database are superseded by this update.

Implemented on `report-overhaul`; not deployed to the shared beta project.
Apply the foundation migration first, then
`20261111000000_report_processing_jobs.sql`. This layer does detection and routes
insects to review. It does **not** execute the alive/dead model or provide the admin UI. The
subsequent [community review layer](COMMUNITY_REVIEW.md) now finalizes votes,
publishes completed reports, and awards verified insect credit.

## End-to-end flow

1. The app prepares a JPEG, uploads it, and inserts a report. An insert trigger
   enqueues `report_processing_jobs` in the same transaction. Closing the screen
   after the save does not cancel detection. The file transfer itself must finish
   before the durable job exists; resumable uploads are not implemented.
2. A scheduled `process-report-jobs` Edge Function claims one oldest eligible job
   with `FOR UPDATE SKIP LOCKED`. A random lease token expires after two minutes.
3. The worker downloads the stored photo and computes its exact-byte SHA-256.
   `prepare_report_processing` verifies the lease and reserves the global hash.
   Exact duplicates are rejected before any Roboflow inference. Existing hashes
   are idempotent for the same report and remain blocked after deletion.
4. The worker calls Roboflow with a 45-second timeout and validates/filter boxes
   through the existing response parser. One transaction stores the detector
   snapshot, creates all pending insect records, and marks the job complete.
   Zero detections routes to admin review. Successful detections route to
   alive/dead review. Manual boxes/admin rejections made during processing are
   preserved instead of being overwritten by the worker's result.
5. The app displays owner-only job status, polls every 10 seconds while work is
   pending in the foreground, and refreshes when returning to the app. Quiet
   polling reuses already loaded photos rather than redownloading every image.
   No push notifications. A heartbeat records real app activity for the 14-day
   reviewer window. The published feed explicitly filters `workflow_status`.

There is no dependency on a phone staying awake after the report is saved. The
worker needs to be deployed and scheduled for this to be true in the hosted beta.
A SQL outbox alone does not run jobs.

## Recovery and access controls

- Retryable photo/inference errors back off 1, 2, 4, then 8 minutes, with at most
  five actual processing attempts. Configuration failures stop immediately.
- Worker crashes leave leased jobs in SQL. The next scheduled invocation can
  reclaim an expired lease. A sixth claim only finalizes an abandoned exhausted
  job; it never invokes Roboflow again.
- Prepare, completion, and failure RPCs fence stale tokens AND expired leases.
  A superseded worker cannot overwrite a newer result or mark its job failed.
- Permanent technical failures route to admin review. Owners can retry a technical
  failure after 15 minutes; duplicates, reviewed insects, no-detection completed
  jobs, and admin-rejected reports cannot be reopened through this endpoint.
- Normal members cannot claim jobs, see tokens/other owners' status, register
  hashes, save detections, or alter attempts. RLS and column grants enforce this.
- Referenced photos cannot be deleted/reuploaded by their owner, preventing image
  substitution after hash verification. Delete the report before cleaning up the
  orphaned storage object. Storage itself remains private.
- Database completion is atomic; upstream HTTP is **at least once**, not exactly
  once. A crash after Roboflow responds but before SQL completion may repeat
  inference. Workflow caching helps but does not guarantee zero duplicate usage.
- Legacy native assessment and voting code remains in the repo, but the new
  upload/review flow does not invoke it. Authoritative voting is implemented by the subsequent community-review
  migration and popup; legacy shadow votes never contribute to its quorum.

## Hosted setup (manual rollout)

1. Apply both new migrations to the intended project, coordinated with this
   client version. The job migration backfills all `pending_detection` reports.
2. Set the existing Roboflow function secrets plus a freshly generated
   `REPORT_WORKER_SECRET` containing at least 32 random ASCII characters. Use
   `supabase/functions/.env.example` as a template; actual values stay uncommitted.
3. Deploy both functions:

   ```sh
   supabase functions deploy process-report-jobs
   supabase functions deploy identify-report
   ```

   `supabase/config.toml` disables gateway JWT verification **only for the worker**.
   Its handler independently authenticates `x-worker-secret` before claiming jobs.
   User JWTs/public keys cannot authorize worker execution. `identify-report`
   retains JWT verification and only requests an owner-scoped technical retry;
   the current app calls the same retry SQL RPC directly.
4. Enable `pg_cron` and `pg_net` through the project dashboard. In Vault, create:
   - `project_url`: the intended project's HTTPS URL.
   - `report_worker_secret`: exactly the worker's dedicated secret.
5. Run `supabase/operations/schedule-report-worker.sql` once in that project.
   It installs/updates a named once-per-minute cron job, invoking the worker only
   when SQL contains due work. At this initial beta setting throughput is about
   one report per minute. Secrets are referenced by name, not embedded in Git.
6. Confirm a real upload advances queued -> running -> complete and enters
   pending review/admin review; try a duplicate and an intentional technical
   failure. Check Cron history and function logs if jobs stay queued.

The scheduling approach follows the official
[Supabase scheduled Edge Functions guide](https://supabase.com/docs/guides/functions/schedule-functions).
Our endpoint uses a dedicated custom worker token rather than a service-role key
in Cron requests. As described there, pg_net temporarily places decrypted headers
in its HTTP request queue; do not grant untrusted roles access to that queue or
Vault. No secrets are returned in the app's status responses.

For local integration testing, serve the functions and POST to the worker with
`x-worker-secret` from a private REST client. A local/manual invocation works even
without Cron. The pure worker tests mock Roboflow to avoid live API usage.

## Verification

- `npm test`: worker hashing/order, duplicate short-circuit, authentication,
  exhausted jobs, sanitized failures, malformed output, and in-app statuses.
- `npm run typecheck` and `npm run build:web`.
- `deno check supabase/functions/identify-report/index.ts supabase/functions/process-report-jobs/index.ts`.
- `tests/report-processing-access.sql`: full schema, backfill/enqueue, exclusive
  leases, stale-worker fencing, hash gating, atomic insects, retries/exhaustion,
  status privacy, referenced photo protection, deletion and cooldowns. Disposable
  PostgreSQL only; fixtures roll back. Included in CI.

The hosted scheduler, actual Edge runtime limits/latency, and live Roboflow calls
still require deployment verification. Neither this implementation nor its tests
provision free alive/dead inference hosting; that remains a later phase.
