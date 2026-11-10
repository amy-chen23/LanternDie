# Admin moderation controls

> Deployment update (November 9, 2026): database migrations have been applied to
> LanternDie. Worker, scheduler, and hosted-client deployment remain pending.
> See [current rollout status](REPORT_OVERHAUL_ROLLOUT.md); implementation-time
> statements below about the shared database are superseded by this update.

Implemented on `report-overhaul`; not deployed. Apply
`20261114000000_admin_moderation.sql` after the four earlier overhaul migrations,
with the matching client. Admin assignment stays manual through `app_admins`.

## In-app flow

The Admin tab provides:

- **Needs attention:** the existing oldest-first admin queue (no detections,
  terminal processing failures, and unresolved community reviews after 48 hours).
- **All reports:** the most recent 10 submissions, including published/rejected
  reports, so existing decisions can be overridden.
- **Find report:** exact UUID lookup for older or specific submissions.

Open **Moderate report** for the saved photo, numbered active boxes, current
per-insect decisions, community vote counts, optional model scores, committed kill
credit, and the latest 50 audit events. Removed boxes remain in the database and
audit history, but do not appear as active insects.

Each change has a preview, a required 1–1000 character reason, and an explicit
Confirm change step. It records the current account, timestamp, reason, and state
changes through the existing audit triggers. Admin decisions have no appeals.

### Decisions and publication

- Mark an insect Alive or Dead, including overriding an existing final decision.
- Finalizing the last pending insect may automatically publish a sealed report
  whose photo hash is registered. Every verified dead insect earns one credit;
  all-alive reports publish with zero.
- Explicitly Publish a manually corrected report once every active insect is
  final and photo checks registered the hash. Restore publication can reverse an
  admin rejection, under the same prerequisites.
- Reject a report to hide it from the feed and remove its credits. Exact-photo
  duplicate hashes remain blocked. A duplicate cannot be published through these
  controls because it cannot register its own hash.
- Decisions on a rejected report do not republish it; explicit restoration is
  required. No whole-photo alive/dead shortcut is used.

### Box corrections

Add a missed insect, draw a replacement box, move/resize by dragging, or enter
precise x/y/width/height values. Coordinates refer to the saved photo, with UI and
server checks that the box stays inside its dimensions. The selected draft is red;
other active boxes remain visible in gray. Remove box retires the insect rather
than destroying its decision history.

The new report photo dimension columns are backfilled from existing detector
metadata and populated for new detector results. Where a missed/failed detector
left no dimensions, a trusted admin may supply dimensions from the displayed
saved photo once. Later client edits cannot replace stored geometry. Ordinary
users cannot insert/update these columns. The existing beta uploads are resized
by the client; manual fallback geometry is limited to four megapixels.

A correction increments the insect revision and clears its decision/model
assessment. Previous community labels remain auditable but cannot count toward
the new revision. Published reports stay visible and retain committed credit
until all remaining active insects are resolved; removing every box immediately
removes phantom credits. Unpublished reports still require all insects finalized
before publication.

## Concurrency and permissions

`admin_get_report_moderation(report_id)` checks current membership and returns a
snapshot version derived from the most recent report audit event ID. The response
includes privileged vote aggregates, model evidence, and audit history; ordinary
users cannot call it.

`admin_moderate_report(report_id, version, action, reason, insect_id?, revision?,
box?, image_width?, image_height?)` is the only authenticated moderation mutation
entry point. It locks the parent report, rechecks role/version, validates current
box ownership/revision and geometry, then invokes the existing database helpers
and returns a fresh snapshot. Allowed actions are box_save, box_remove,
decide_alive, decide_dead, reject, and publish. Unsupported actions fail.

Prior low-level admin mutation RPCs are no longer executable by authenticated
clients or the service role; the new definer facade can call them internally.
This closes an older unversioned box-edit path. Deploy the new client with the
migration; scripts that called those RPCs directly need to use the new facade.

Concurrent admin changes, review votes, decisions, and credit changes make an
open proposal stale. The server refuses it; the UI requires Refresh and a new
confirmation rather than silently replacing newer data. Network errors after a
write likewise require a refresh, avoiding automatic resubmission of a decision
that may already have committed.

The role hook/RLS still enforce revocation. The admin modal unmounts when the role
is lost or the account changes. The UI refreshes its queue and owner/feed data
after successful changes, while keeping the moderation modal open even when the
report leaves the attention queue.

## Validation and rollout

- `tests/admin-moderation-access.sql` runs the full migration chain in a disposable
  database, covering non-admin/revoked access, direct-helper bypass prevention,
  mandatory reasons, stale snapshots/revisions, missing/invalid geometry,
  out-of-bounds boxes, hash-gated publication, mixed lifecycle changes, rejection,
  restoration, correction credit retention, removal, and persistent audit reasons.
- `tests/moderation-geometry.test.mjs` checks display-to-photo scaling, reverse
  drawing, edge/corner gestures, moving/resizing boundaries, and invalid values.
- Type checking and web production export validate component integration. CI now
  includes the moderation suite alongside the six existing database suites.

Nothing has been applied to the shared beta database. A live multi-account pass
and mouse/touch walkthrough remain necessary after migration deployment. Test
role revocation with a modal open, simultaneous admin/reviewer actions, first-time
manual boxes on a no-detection photo, published mixed-insect reversals, duplicate
rejection, and deletion before confirmation. No live Roboflow calls were required
for the automated checks.
