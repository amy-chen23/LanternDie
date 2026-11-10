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

## Worker and queue follow-up

The worker and updated retry endpoint are deployed. Private worker authentication,
Vault settings, and the once-per-minute Cron schedule are configured. Live manual
and scheduled calls succeeded, created insect records, and moved reports into
community review. Temporary local secret files were removed after deployment.
An admin account has since been assigned manually.

Migration `20261115000000_admin_attention_unclassified.sql` is also applied:
Needs attention now includes unclassified insect reviews immediately, rather than
waiting 48 hours. Community voting is still available.

## Still pending

- Deploy the matching hosted app/client.
- Run live multi-account, mouse, and touch checks.
- Evaluate the independent image set and deploy alive/dead server inference.

**Background processing is running.** Reports reach the feed after all insects
receive final decisions. The hosted client may still be older than this schema;
use this branch's local client until the hosted-client rollout is complete.

See [pipeline setup](REPORT_PROCESSING_PIPELINE.md),
[admin assignment](ADMIN_ROLE.md), and [moderation controls](ADMIN_MODERATION.md).
