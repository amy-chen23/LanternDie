# Report storage setup

Apply `migrations/20261001230742_private_reports.sql` to the free Supabase
project before testing report submission. It creates a private photo bucket
limited to 5 MB JPEG files and a `reports` table. Both are restricted to the
signed-in owner. Use the Supabase SQL Editor or link a Supabase CLI project and
run `supabase db push`.

Apply `migrations/20261016142713_profile_photos.sql` before testing profile
pictures. It creates a separate private bucket for JPEG avatars, limited to
2 MB per image. Each signed-in account can read and replace only its own photo.

Apply `migrations/20261018201510_report_details_community.sql` and then
`migrations/20261018201548_combine_report_read_policy.sql` after the private
reports migration. They add observation date, optional location and
caption, public/private sharing, member votes, and inaccuracy flags. Existing
reports remain private. Public report images remain in the private bucket and
are downloaded with the member's session so a visibility change affects new
requests immediately. The app needs this migration before using the new upload
form or community feed.

## Lanternfly identification

Apply `migrations/20261019180000_report_identification.sql` before running this
branch's app. It adds server-owned identification results with the same read
visibility as their report. Existing reports remain unassessed until their owner
taps **Identify lanternfly**. Users cannot insert/update model results or call
the inference-claim database function directly.

New uploads are saved first, then the app invokes the authenticated
`identify-report` Edge Function. The function verifies report ownership,
downloads the private JPEG, and sends its base64 bytes to Roboflow's hosted
workflow endpoint (or an optional direct detector). No public photo URL is created. Uploaded report photos
are therefore sent to Roboflow for processing; update your user-facing privacy
notice to describe that service before releasing this feature.

### Configure and deploy

1. Use the general segmentation workflow offered by the
   [Ryan Su dataset](https://universe.roboflow.com/ryan-su-research/spotted-lanternfly-annotated-set)
   deployment snippet. Its supplied identifiers are workspace
   `testing-workspace-3pknz` and workflow `general-segmentation-api-2`, already
   included in the configuration template. Use a Roboflow API key authorized to
   run this workflow. The workflow uses a general model with lanternfly class
   prompts; this is not evidence it was trained on this dataset. You do not need
   to train another detector to try this route. Actual access and performance
   must be checked with your key and test images.
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and replace
   the placeholders. This file is ignored by Git. `ROBOFLOW_CLASSES` is the
   comma-separated class prompt sent to the workflow and the allowlist of labels
   accepted from its output. The defaults match the three life stages in the linked dataset.
   Adapt this value if your detector uses different names, such as `lanternfly`.
   `ROBOFLOW_DETECTION_THRESHOLD` defaults to `0.5` and must be in `(0, 1]`.
   Workflow results are filtered at this threshold after inference. The workflow
   may also have internal filtering that this setting cannot override.
   Authentication uses `Authorization: Bearer <key>`, matching the snippet's
   `api_key_transport="header"`; keys are not included in URLs or request bodies.

   Alternatively, remove both `ROBOFLOW_WORKSPACE` and `ROBOFLOW_WORKFLOW_ID` and
   set `ROBOFLOW_MODEL_ID=your-project/version` to use a trained detector directly.
   Workflow configuration takes priority; partial workflow configuration fails
   rather than silently falling back to a different model.
3. Using the Supabase CLI, link the intended project, apply migrations, set the
   function secrets, and deploy:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy identify-report
   ```

   Keep JWT verification enabled. The function also validates the user with
   Supabase Auth and checks ownership on every request. Hosted functions already
   have `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
   Never put the service-role key or Roboflow API key in Expo/Vercel public
   variables. See [Supabase function secrets](https://supabase.com/docs/guides/functions/secrets).
4. For local Supabase development, use `supabase functions serve identify-report
   --env-file supabase/functions/.env` and point Expo at that local Supabase
   instance. Access to the hosted workflow or direct detector is still required.

### Results and retries

Results include the inference source ID, detection threshold, inference
image dimensions, class labels, confidence scores, and top-left pixel bounding
boxes. The app scales the boxes against the stored JPEG's aspect ratio. After an
upload check finishes, a results pop-up opens with the image, numbered boxes, and
confidence scores. Use **View identification results** in Recent activity or
Community to reopen the pop-up. Detection results do not verify death or award points.

For workflows the existing `model_id` column stores
`workflow:<workspace>/<workflow-id>`, rather than an underlying model version.
The workflow definition may change; this identifier does not pin its version.
The REST response must contain exactly one image's `outputs` row with a detection
object (image dimensions plus predictions). Segmentation masks are ignored; their
bounding boxes are retained. A single detection object is discovered automatically.
If multiple detection outputs exist, set `ROBOFLOW_WORKFLOW_OUTPUT_KEY` to the
desired output name. Missing or ambiguous output is a failed check.

Completed results are cached. A database lease prevents duplicate inference for
parallel requests. Failed checks can be retried without reuploading the photo.
An interrupted processing lease expires after two minutes; refresh or retry to
recover. An attempt ID prevents an older request from overwriting a newer result.
API timeouts, malformed output, and configuration errors become failed checks,
never "No lanternfly detected." If invoking the function itself fails, the saved
report remains available with an Identify/Retry action. A running check can be
refreshed using **Refresh reports**; processing does not rely on a background
task continuing after an Edge Function response.

The default 50% threshold only filters lanternfly identification. The proposed
70% probability-of-death gate is not implemented in this increment. Alive/dead
status is explicitly unassessed, including when identification succeeds.

### Validation

Run `npm test`, `npm run typecheck`, and `npm run build:web`. To type-check the
Edge Function with Deno separately, run:

```sh
deno check supabase/functions/identify-report/index.ts
```

`tests/identification-access.sql` checks the migration, visibility policies,
write restrictions, caching, and lease recovery against PostgreSQL. Run it only
in an empty disposable database with `psql -v ON_ERROR_STOP=1 -d SCRATCH_DATABASE
-f tests/identification-access.sql`; it creates a minimal report/auth fixture and
rolls back all objects. CI runs it against a fresh PostgreSQL service.

With a configured test project and detector, check these behaviors:

- Upload a lanternfly image: the saved result has boxes aligned with the insect
  and includes detection confidence; death stays unassessed.
- Upload an image without a lanternfly: a completed check shows **No lanternfly
  detected**. Try a multiple-insect image and a portrait photo too.
- Disable the Roboflow key temporarily: the report remains saved, the check
  fails, and Retry succeeds after restoring the key.
- Invoke the function twice concurrently: only one request acquires the lease.
  Repeat after completion: no new inference request is made.
- As another signed-in user, read a public report's results, but verify that
  invoking identification for that report returns 404. Switch it to private and
  confirm that user loses read access to both report and results.
- Confirm anonymous reads and authenticated writes to `report_identifications`
  are denied. Confirm authenticated callers cannot invoke
  `claim_report_identification` directly.

App type-checking excludes the Deno-only function entry point; Deno checks it
using its own runtime types. The Node tests exercise the shared response parser,
including malformed responses, class filtering, boundary clipping, and multiple
insects. Workflow tests also verify header authentication, request inputs, output
unwrapping, segmentation boxes, and invalid configuration. Live inference requires
your authorized workflow/model and key and is not mocked as a successful
deployment.

## Temporary leaderboard

Apply `migrations/20261109000000_raw_upload_leaderboard.sql` to enable the
temporary weekly and monthly rankings. This authenticated RPC counts saved
report rows by their creation date; each upload temporarily counts as one
verified kill. Votes, flags, and classifier output are not included. Replace
this function's counting rule with the real verification source when it is
available.

To check access controls, create two test accounts, upload and insert a report
as the first account, then verify that the second account cannot select the
report or read its photo. Verify that a signed-out client cannot read either.
For profile pictures, verify that a second account cannot list, read, or
replace the first account's avatar.

Then make a report public and verify the second account can see its details
and download its image, vote once, switch or remove the vote, and flag once.
Verify self-votes and self-flags are denied, and that switching the report back
to private blocks the second account from new detail and image requests.

## Report overhaul database foundation (not yet deployed)

The `report-overhaul` branch adds migration
`20261110000000_report_overhaul_foundation.sql` for server-owned report/insect
states, admin permissions, persistent exact-photo hashes, audit records, and
verified-insect credits. It replaces raw-upload leaderboard counting.
Read [rollout requirements and database API](../docs/REPORT_OVERHAUL_DATABASE.md)
before applying it: deploy the subsequent background pipeline and matching client
together. Existing beta reports return to pending with zero credits until reviewed.

## Durable background upload pipeline (not yet deployed)

Migration `20261111000000_report_processing_jobs.sql` adds transactional enqueue,
leased worker jobs, server-computed exact-photo duplicate checks, atomic detector
results/boxes, retries, and owner-only processing status. See the
[pipeline and scheduler setup](../docs/REPORT_PROCESSING_PIPELINE.md) before
deployment. `identify-report` is now a compatibility retry endpoint; detection
runs in scheduled `process-report-jobs`. Native scoring is no longer invoked
automatically by uploads.

## Authoritative community voting (not yet deployed)

`20261112000000_community_review.sql` adds revisioned review labels, expiring
reviewer reservations, private post-vote feedback, and database-enforced
three-matching-vote consensus. The model worker can no longer supply community
decisions. See [community review rules and rollout](../docs/COMMUNITY_REVIEW.md).

## Admin role discovery (not yet deployed)

`20261113000000_admin_role_access.sql` exposes only the signed-in account's admin
status. Membership uses existing `auth.users.id` values in `app_admins`; no user
columns or separate login are introduced. The app shows an admin-only read queue
and refreshes membership without requiring a new login. See
[manual role assignment and access rules](../docs/ADMIN_ROLE.md).

## Versioned admin moderation (not yet deployed)

`20261114000000_admin_moderation.sql` adds protected moderation snapshots and a
versioned action facade, image-bound box validation, and confirmation/reason-driven
UI controls. Low-level admin mutation RPCs are now internal-only. See
[moderation behavior and rollout](../docs/ADMIN_MODERATION.md) before deployment.
