# Frontend handoff — November 16, 2026

The current local app shows Roboflow identification and social reactions. The
matching database migration is applied, but frontend changes are not released.
Use [current rollout](IDENTIFICATION_SOCIAL_ONLY.md) and [QA checklist](QA_RELEASE_HANDOFF.md).

## Screens

- Home: profile shortcut, photo selection, observation date, optional place/caption,
  submission and recent activity. Upload saving must finish before navigation can
  rely on the durable worker job.
- Sightings: Explore and My submissions, filters, owner edit/delete confirmation,
  caption/date, image and Results overlay. Identification shows only counts and
  numbered boxes. There are no approval tags, life-status votes or admin-review tab.
- Map: first open requests foreground location and centers an interactive
  OpenStreetMap view on one device fix. Recenter restores that fix; denied and
  unavailable location states offer a retry. There is no background tracking,
  feed pins or Local Star calculation.
- Leaderboard: existing weekly/monthly point records. Social votes do not change it.
- Profile: identity/photo, display-name editing, existing field points and sign-out.
  Do not imply unimplemented badges, streaks or social features award points.

## Active boundaries

`App.tsx` composes screens. `components/ReportIdentification.tsx` renders results and
owner technical retries. `lib/detection-summary.ts` counts current boxes.
`lib/reports.ts` loads reports, identifications, active boxes, historical credits,
authors and signed photo URLs. `lib/report-photo-urls.ts` caches one-hour URLs.
Social writes use `setReportVote`; the existing database trigger computes counters.
Technical retries call `retry_report_processing`. The classifier/review APIs are
not part of the active UI. Some old helper/component files still exist unused;
do not reconnect them merely because they remain in source.

Use `identification.status`/dimensions/boxes for detection presentation and
`processing.status` for job progress/retry. Historical `report_insects.label` and
`report_kill_credits` remain in the data model; do not turn them into automated
predictions or award new points. Source photo identity and detector boxes must not
be replaced by client-invented values.

## UI work and coordination

Presentation/layout in the active screens can change without a new model/runtime.
Preserve accessible photo descriptions, decoded image rendering, Results overlay,
owner actions, account resets, visible failures and rollback for denied votes.
Use realistic signed URLs/JPEG responses in browser fixtures: empty URL batches
previously allowed a missing photo renderer to escape tests.

Coordinate changes to report queries, upload normalization, ownership, storage,
retry behavior, migrations and point semantics. New point allocation is unresolved;
social incentives are explicitly separate. Do not edit applied migration 19 or
bulk-apply the remaining draft migrations. Use the existing Vercel Git deployment
path only after the source release is reviewed/approved.

## Upload map locations

The upload picker does not request or read EXIF. Upload photos are re-encoded as
JPEG before upload, which removes embedded metadata. Map sharing is an explicit,
per-report opt-in and off by default. Only after opt-in does the app request one
foreground device location fix, round both coordinates to two decimal places
(about 1.1 km at the equator), and show that rounded pin in a map preview. The
exact device fix remains in memory only and is never sent to Supabase. The report
can be submitted without a pin.

The `report_map_locations` table stores only rounded public pin coordinates;
RLS restricts reads to visible community reports and writes occur only through
`submit_report_with_approximate_location`. The migration removes the earlier
private EXIF/device metadata table and RPC. Apply the migrations before testing
uploads against Supabase. Map-pin storage is in place; rendering community pins
on the main Map tab remains a separate UI task.
