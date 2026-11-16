# Identification and social reactions only — November 16, 2026

This records the current detector-only application and database workflow. The user
approved migration 19, and it was applied to the linked Supabase database on
November 16. Frontend work remains local, uncommitted and undeployed.

## Hosted database rollout — APPLIED

Applied only `20261119000000_identification_social_only`, source SHA256
`e6ff62bf7243471aba405e57b7002d3275595ff02e87cffa639393618156f5aa`, in one bounded
transaction with its single migration-history record. Existing hosted workflow
functions matched the locally tested baseline before replacement. The exact
transaction/preservation assertions were tested in disposable local PostgreSQL
before hosted execution on PostgreSQL 17.11.

The transaction published **3 detected unresolved posts**. Assertions verified
byte-equivalent serialized credit records, insect decisions, social votes, photo
hashes, model registry, report content/counts, previously published states and
unrelated migration history. All **10 credit rows totaling 5 historical points**
were preserved. No new credits or votes were created.

A separate post-commit read confirmed the exact recorded source, zero eligible
detected posts remaining unresolved, empty review/admin queues, revoked execution
of all 12 retired life-review APIs for anon/authenticated/service roles, and intact
worker-failure-handler execution. Drafts 16/17/18 remain unapplied; unrelated avatar
policy was not applied. No endpoint, worker deployment, Git commit/push or Vercel
deployment occurred. Old deployed frontend review controls will disappear only
when the updated frontend is deployed; their retired API calls are now denied.

## Application

Removed approval/confirmed-life-status tags, community Alive/Dead/Uncertain panels,
vote distributions, Needs review, admin review navigation and related API/activity
requests, and the publication celebration. Identification shows only lanternfly
counts and numbered boxes. The detector-threshold/death explanation is removed.
Technical failures retain the owner retry path; no detection suggests a clearer
photo, without promising admin review. Captions, dates, profiles and owner actions
remain. White cards have no classification/status tint.

Social up/downvote controls remain on detected/published sightings, including the
author's own post. They switch, toggle off, persist through refresh, and roll back
with a visible error if saving fails. Social scores do not affect life labels,
points, leaderboard totals or badge credit. Historical points are displayed
unchanged; new allocation remains paused until a policy is chosen.

## Migration behavior

`supabase/migrations/20261119000000_identification_social_only.sql`:

- Publishes hash-registered, initialized, accepted detector results without final
  alive/dead labels. Does not invent biological decisions or grant credits.
- Stops empty/failed detections entering admin review. Empty detections are kept
  out of the feed; terminal technical failures remain available for owner retry.
- Retires review queues and revokes old community/admin life-decision APIs so
  stale clients cannot continue the removed verification cycle.
- Retains author social reactions, vote ownership/uniqueness and count triggers.
  These counters never feed into point allocation.
- Reconciles existing unresolved posts; preserves existing published labels,
  historical credits, audit history, duplicate protection, leases and cooldowns.

Read-only linked Supabase preflight (PostgreSQL 17.11) found **3 detected unresolved
posts** eligible for publication, **0 empty unresolved posts**, and **10 existing
credit rows totaling 5 points**. These counts can change before release. Migration
19 was subsequently applied as recorded above. No dependencies on drafts 16/17/18; **do not bulk-push migrations**
or apply the unrelated outstanding avatar policy as part of this change.

This changed the shared production database and publication rules only after the
user's explicit approval. Do not rerun the migration or reverse it by dropping
history. Any future rollback needs a reviewed source/data plan; no credit reversal
is needed because no credits were granted. The next frontend release should use
the existing Git-mirror/Vercel path, without a new service or infrastructure.

## Validation

- Node 22: **104 local unit tests**, typecheck and web export passed. The unit count
  includes pre-existing untracked shadow tests; none of that prototype work is enabled.
- **38 browser checks passed**, zero skips/flaky, across Chromium desktop/phone,
  WebKit phone and Firefox desktop. Mocked Auth/Storage/REST; real application UI.
  Cover count/box results, no detector-threshold copy, no approval/review controls,
  detector failure/retry, owner edit/delete/profile points, social vote persistence,
  switching/removal, author reactions and failed-save rollback.
- **12 SQL suites passed** in disposable PostgreSQL 18, including the new migration.
  New assertions cover historical credit equality, zero new points from detections
  or reactions, retired RPC permissions, detector-only publication, no pre-detection
  exposure, vote forgery/uniqueness, empty detections, duplicates and owner retries.
  The final legacy admin-decision revocation was separately rechecked afterward.
- iOS and Android production JS/Hermes exports passed. No physical-device claim.
- Production app export contains no classifier assets or retired review RPC strings.
  PostgreSQL17 migration execution and catalog/state checks are now verified above.
  Hosted authenticated end-to-end UI testing awaits the frontend release. No paid
  detector calls or hosted fixture reports/votes were created by these tests.

## Photo-rendering regression fix

The review-panel cleanup accidentally removed `CommunityPhoto` from cards while
retaining the photo container and Results button. Restored the existing memoized
photo component with an accessible description. No storage policy/data changes
were needed: a read-only hosted audit found all 16 report-photo objects present,
zero missing object paths, and valid authenticated access to owned/published photos.

Browser fixtures now return realistic batch-signed URLs and actual JPEG responses.
Assertions verify that card photos are visible, image decoding succeeds, and photos
remain after editing/refresh. Typecheck, web export and all 38 cross-browser checks
passed again with zero skipped/flaky results. This fixes the local frontend; no
additional migration, Git push or Vercel deployment occurred.
