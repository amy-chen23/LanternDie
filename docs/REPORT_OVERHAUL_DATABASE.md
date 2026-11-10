# Report overhaul database foundation

> Deployment update (November 9, 2026): database migrations have been applied to
> LanternDie. The worker and scheduler are live; hosted-client deployment remains pending.
> See [current rollout status](REPORT_OVERHAUL_ROLLOUT.md); implementation-time
> statements below about the shared database are superseded by this update.

Branch: `report-overhaul`, based on `model-implementation`.
Migration: `supabase/migrations/20261110000000_report_overhaul_foundation.sql`.

## Rollout boundary

This is the database foundation for the overhaul. The subsequent
[background pipeline](REPORT_PROCESSING_PIPELINE.md) now supplies durable jobs,
trusted hashing, detector initialization, heartbeat/status updates, and removal of
the private upload control. Deploy its migration, functions, scheduler, and matching
client together. [Community voting](COMMUNITY_REVIEW.md) is now implemented in the third
migration. Admin role discovery/read-only queue are now implemented in the fourth migration.
Admin moderation is implemented in the fifth migration; server alive/dead
inference remains a future phase. No remote database changes are performed by this branch.

The authorized beta data migration sets every existing report's audience to
public but puts it in `pending_detection`, with no verified credits. Previously
private reports become readable by the community when review/publication rules
allow it. Existing detection results, device shadow scores, and social or legacy
biological votes do not automatically finalize authoritative insects. A worker
must reprocess these test reports (it can explicitly seed a current server-owned
detection snapshot). No photos are deleted by this migration.

## Data and rules

- `reports.workflow_status`: `pending_detection`, `pending_review`, `admin_review`,
  `published`, or `rejected`. Visibility is always `public`, independently of
  publication. `insects_ready` seals a complete box set before publication.
- `report_insects`: stable insect UUID, pixel-coordinate box, revision, active
  flag, pending/alive/dead label, decision source/time/reason, optional model
  evidence. Box changes increment revision and clear the affected decision and
  evidence; unchanged insects retain their decisions. Authoritative votes in the next community-review migration are keyed to insect
  UUID AND revision. Legacy votes are not reused.
- `report_photo_hashes`: globally unique SHA-256 of the **exact stored JPEG bytes**.
  The trusted worker must download and hash bytes itself. SQL validates format
  and uniqueness, not the relationship between the supplied hash and image bytes.
  Registration is idempotent only for the same report/hash. The hash remains with
  a null report reference after report/account deletion. No similarity detection.
- `app_admins`: manually managed membership; no client writes or self-promotion.
- `member_activity`: server-timestamped heartbeat through `touch_member_activity()`;
  reviewers qualify for 14 days after their last heartbeat. No fabricated activity
  is backfilled. The upcoming client should heartbeat when actively used.
- `report_kill_credits`: current committed dead-insect count per report, with
  cascaded removal on report/account deletion. No independent client edits.
- `report_audit_log`: report state, box/decision, credit changes, admin reasons,
  actor UUID where present, and timestamps. Service jobs have null actor UUID.
  Audit persists after deletion and is readable only by admins/service; neither
  authenticated users nor the service role can rewrite/delete audit rows.

All active insects must be final, the box set sealed, and the photo hash registered
before initial publication/credit. All-alive sightings publish with zero credits.
Native scores remain untrusted shadow data and cannot grant credits. Model versions
have `automatic_approval_enabled = false` by default; independent evaluation and
an approved cutoff are prerequisites to enabling a version. Only a model decision
of dead meeting its registered threshold is permitted.

Published posts stay visible while an admin corrects boxes. Existing committed
credits remain while any corrected active box is pending; once all active boxes
are final the snapshot is atomically replaced. This is the implementation default
for the previously unresolved credit timing. If all boxes are removed, credits
are removed immediately so no phantom kills remain; the post stays visible until
an admin explicitly rejects it. Rejection removes all credits and hides the report
from ordinary members. Admin insect reversals immediately reconcile credits.

Weekly/monthly rankings retain the existing `get_raw_upload_leaderboard` RPC name
and response shape for compatibility, but sum real credits by **first publication
time**, not upload time or later correction time. Ties use name then user UUID.
The old UI's raw-upload explanatory wording needs updating in the UI phase.

## Protected operations

Trusted backend (service role only):

1. Save/download the report photo and compute its SHA-256. Call
   `register_report_photo_hash(report_id, sha256)` before doing paid/expensive work.
   A unique violation means duplicate; do not retry with a different hash.
2. Run the Roboflow gate. Failed/no-detection results route unpublished reports
   into `admin_review`. Transient errors can be retried by the future worker.
3. Call `initialize_report_insects(report_id, detector_updated_at)` for the current
   successful server detection snapshot. It creates the entire pending insect set
   atomically and seals it. Repeat initialization is rejected to preserve edits.
4. Submit a final decision through `record_report_insect_decision(insect_id,
   revision, label, source, reason, model_sha256, model_score)`. This foundation initially allowed trusted consensus workers; the later
   community-review migration restricts this RPC to model decisions, with quorum
   enforced directly in SQL. The RPC is NOT available to the app. It refuses stale revisions or rewriting
   final decisions. Model decisions additionally require an enabled registered
   model and a qualifying score. Automatic approval is disabled initially.

Admin (foundation helpers; internal-only after the fifth migration):

- `admin_edit_report_insect(report_id, insect_id, box, active, reason)` adds a box
  when insect ID is null, edits a box, or retires it using `active = false`.
- `admin_decide_report_insect(insect_id, revision, label, reason)` finalizes or
  overrides a label. Only an admin may override a final decision.
- `admin_publish_report(report_id, reason)` seals a manually corrected detection
  set or restores a rejected report. It still requires a registered hash and
  final decisions for at least one active insect.
- `admin_reject_report(report_id, reason)` rejects a report and removes credits.

Manually assign an existing user's UUID through a privileged SQL session:

```sql
insert into public.app_admins(user_id) values ('EXISTING_USER_UUID');
```

Never put the service-role key in the app. Ordinary users cannot write statuses,
insects, decisions, hashes, model policy, audit rows, or credit snapshots.

## Access and queues

Signed-in users can read published reports; uploaders can also read their own
pending/rejected reports. Admins can read all reports. Active reviewers can read
pending-review reports and their photos for the queue. The audience is the existing
signed-in community, not anonymous internet access. Storage access follows report
RLS; the bucket stays private. Social votes/flags require a published report.

`report_verification_queue` exposes reports with unresolved insects, including
corrections to published posts. Clients must order by `created_at, id` for the
oldest-first queue. `report_admin_queue` includes explicit admin-review reports and
unresolved reviews at least 48 hours old. Escalation is a live view, not a scheduled
job. Edits reset the review timer. Neither view sends notifications.

Machine scores are excluded from authenticated column grants on `report_insects`;
select explicit granted columns rather than `select('*')`. The subsequent voting migration adds guarded feedback after a member labels
the current box revision. The legacy owner-only shadow-score
table remains separate. The later community-review layer stores authoritative votes with own-row RLS
and exposes only aggregate feedback after submission.

## Next implementation phases

- Background jobs, leases/retries, hashing/backfill, and worker integration are
  now implemented in the next migration; see the pipeline guide. Duplicate files
  are rejected after upload, before detector calls or publication.
- Authoritative per-revision review votes, three matching decisive labels from up
  to five distinct eligible reviewers, no self-review, and vote edits before final
  decisions. The legacy voting RPC remains shadow-only and does not implement
  these rules. The future trusted consensus worker must enforce them.
- Oldest-first claim UI, automatic review popup, admin UI, in-app statuses, and
  removal of privacy controls. Feed queries must explicitly filter `published`
  because eligible reviewers can also read pending queue reports through RLS.
- Independent model evaluation, cutoff choice, free inference hosting, then
  enable a specific validated model version. No automatic approval yet.

## Validation

`tests/report-overhaul-access.sql` applies the full migration chain to minimal
Supabase auth/storage fixtures in a **disposable empty PostgreSQL database**.
It checks migration/backfill, role escalation prevention, pending/photo access,
active-member expiry, exact hash uniqueness/tombstones, disabled model approval,
partial/all-alive publication, corrections and stale revisions, admin reversals,
rankings, rejection, escalation, and report/account deletion. Everything rolls back.
CI runs it alongside the existing database access suites.

```sh
psql -v ON_ERROR_STOP=1 -d SCRATCH_DATABASE -f tests/report-overhaul-access.sql
```

The latest client uses [versioned moderation](ADMIN_MODERATION.md) instead of
calling these original helper RPCs directly. Apply all overhaul migrations with
the matching app version.
