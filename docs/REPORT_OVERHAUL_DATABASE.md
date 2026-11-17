# Database and storage

Current workflow is [identification and social reactions](IDENTIFICATION_SOCIAL_ONLY.md).
Migration `20261119000000_identification_social_only.sql` is applied to the linked
Supabase project. Historical migration files remain because they describe the
existing schema; they are not instructions to restore retired features.

## Current data

- `reports`: owner, source photo, date/place/caption, visibility, social counters
  and workflow status. Members can edit only allowed detail columns, not counters,
  workflow, source identity or ownership.
- `report_identifications`: server-written Roboflow result, dimensions and boxes.
- `report_insects`: initialized active boxes/revisions. Historical life labels and
  decision metadata remain stored but are neither requested from users nor shown
  as detector predictions. There is no requirement for final labels to publish.
- `report_processing_jobs`: durable jobs, attempts, availability and fenced leases.
  The app sees allowed owner-status columns, not worker tokens.
- `report_photo_hashes`: exact stored-JPEG SHA256, globally unique. Tombstones
  survive deletion. Similarity/near-duplicate detection is not implemented.
- `report_votes`: one social reaction per member/report, constrained to ±1. Existing
  triggers maintain report counters; scores never feed into point allocation.
- `report_kill_credits`: retained historical point records. New detector results
  and social votes do not grant or recalculate points. Existing deletion/rejection
  semantics still apply; no client can edit credits directly.
- `report_audit_log`: retained database history. Do not discard it during cleanup.

## State and access

New processing uses `pending_detection`, `published` and `rejected`; legacy
`pending_review`/`admin_review` values remain supported for compatibility, not a new
review stage. Migration19 reconciled unresolved posts, emptied review/admin queue
views and revoked twelve retired review/decision API entry points.

Private `report-photos` storage is JPEG-only with a 5 MiB limit. Read policy follows
accessible reports or owned paths. Signed URLs expire after one hour. The app must
render the photo as well as obtain its URL; image-decoding checks cover that path.
`profile-photos` is a separate private bucket. The community-avatar policy migration
`20261113183128` was still unapplied at the November 16 audit; this is independent
of report-photo access and must not be silently included in another rollout.

`app_admins` membership and private role helpers remain for historical access/RLS.
There is no admin review UI in the current app. Do not use editable Auth metadata
as authorization. Retained assessment/training tables and model registry are
historical data, not an active inference service; destructive removal is separate.

## Migration discipline

Inspect remote history before changing a shared database. Never use a bulk
`supabase db push` against this checkout: drafts 16/17/18 are unapplied prototypes
or superseded policies. They are not dependencies of migration 19. Commit the exact
already-applied migration 19 source with the application release; do not rerun it,
edit its applied contents, or delete its history record.

Future migrations need their own reviewed scope and approval. Use a bounded
transaction, record only the intended source/version, and verify historical
credits, social votes, photo/source identity and unrelated history afterward.
All development/QA clients using this project's public configuration still access
the shared backend; local UI does not imply an isolated database.
