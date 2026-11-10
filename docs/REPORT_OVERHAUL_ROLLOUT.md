# LanternDie overhaul rollout

Database migrations applied to the linked **LanternDie** Supabase project on
November 9, 2026. The linked project matches the app's configured Supabase URL.
Implementation checkpoint: `0f16dba` on `report-overhaul`.

## Applied and verified

The pending leaderboard prerequisite (`20261109000000`) and overhaul migrations
`20261110000000` through `20261114000000` applied successfully. Remote migration
history now matches every local migration. A dry run preceded deployment.

Read-only post-deployment verification found:

- All nine new workflow/review tables exist with row-level security enabled.
- Nine existing beta reports are public submissions in `pending_detection`.
- Each has a queued processing job; no pending reports are missing jobs.
- Verified kill credit is zero while reports await verification.
- Automatic model approval remains disabled for every model version.
- No admin accounts are assigned yet.
- Anonymous role discovery, client status edits, and legacy unversioned box edits
  are denied. The authenticated moderation facade is available and still checks
  actual admin membership inside every operation.

These counts describe the verification snapshot and will change during beta use.
No photos or users were deleted. Existing private test submissions entered the
public verification workflow as authorized; they are not published feed posts
until every insect has a final decision.

## Still pending

- Push the committed branch to GitHub (only local commits were requested).
- Deploy the matching hosted app/client.
- Deploy the updated `identify-report` and new `process-report-jobs` functions.
- Configure the worker secret and Vault entries, then install its Cron schedule.
- Assign the intended existing account UUIDs to `app_admins` manually.
- Run live multi-account, mouse, and touch checks.
- Evaluate the independent image set and deploy alive/dead server inference.

**The nine queued jobs will not run until worker deployment and scheduling.**
The previously deployed client/functions may not match the migrated schema;
use this branch's client for testing and complete the coordinated rollout.

See [pipeline setup](REPORT_PROCESSING_PIPELINE.md),
[admin assignment](ADMIN_ROLE.md), and [moderation controls](ADMIN_MODERATION.md).
