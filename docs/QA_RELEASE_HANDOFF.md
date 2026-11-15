# QA handoff — backend freeze, November 13, 2026

**Suitable for supervised exploratory QA of the local branch; not a production
release sign-off or a verified hosted shadow-inference release.** Branch:
`report-overhaul`, HEAD `ba8f3c8` plus the uncommitted work inventoried in
[HANDOFF_COMMIT_INSTRUCTIONS.md](HANDOFF_COMMIT_INSTRUCTIONS.md). No commit, push,
merge, deployment, migration or live behavior change occurred during this freeze.
This freeze supersedes M2B's plan to resume hosted work after approval.

## Environments and evidence

- Local working tree: current UI/browser inference, community review/moderation
  and shadow proof source. Use Node 22 per `.node-version`, `npm ci`, then
  `npm run web`. `.env` needs the existing public Supabase URL/anon key. This local
  client still uses the configured shared hosted DB; local UI is not a data sandbox.
  Use approved QA accounts/reports. Do not copy server secrets into public variables.
- Production: `https://lanterndie.vercel.app/`. The M2B read-only audit found a
  different, older client bundle. A 200 response verified availability only;
  multi-account upload-to-credit behavior was not revalidated remotely.
- Supabase at the M2B audit: PostgreSQL 17.11, migrations through `20261115000000`.
  Private JPEG bucket, 5 MiB cap, model registration and existing RLS/RPC grants
  inspected. Detector/retry functions are deployed; no live test invocation here.
- Shadow Preview: **not deployed**. No hosted Node/Linux inference, Auth/Storage,
  latency, memory or end-to-end persistence result is claimed.

Fresh freeze checks: `npm test` **89 passed**; `npm run typecheck` passed;
`npm run build:web` passed (1 MB app JS); `git diff --check` passed. Node 24.14.1
ran these quick checks; M2A native inference was separately tested on Node 22.16.0.
No browser, SQL or Python suites were rerun during this short freeze. Prior evidence:
[M1 tests](MILESTONE_1_TEST_RESULTS.md), [M2A handoff](MILESTONE_2A_TRUSTED_INFERENCE.md)
(9 browser tests, real local PostgreSQL retries, native model and PyTorch parity),
and [M2B audit](MILESTONE_2B_DEPLOYMENT_PLAN.md). Prior passing tests are not hosted QA.

## App functionality QA can exercise

Use one uploader, at least three distinct eligible non-owner reviewers, an ordinary
other user, and an existing DB administrator. No credentials belong in this document.
Reviewers need recent activity (14 days); seats expire after 15 minutes. Five seats
and three matching decisive votes remain the existing rules. Do not assign roles
or alter shared data just to bypass a test failure.

1. Sign in/out, switch accounts and tabs. Expect account-scoped reports; Admin
   appears only after a successful DB permission check. A stale account response
   must not grant privileges. Check profile/photo, existing badges and navigation.
2. Upload a valid photo with caption/date/location. Expect a durable background
   processing status; leaving the screen must not cancel the server job. Roboflow
   locates lanternflies; it does not decide alive/dead. Exact-byte duplicate checks
   run before paid detection; duplicates are rejected without credits.
3. Open detected insects. On local web, unchanged ONNX scores each matching crop
   in a worker after detection. Labels are DEAD, ALIVE, LIKELY DEAD or UNCERTAIN;
   final decisions override feedback. Raw score >=0.98 may show LIKELY DEAD but
   **never grants verification or credit**. Below cutoff is UNCERTAIN, not ALIVE.
   Expo Go lacks the native ONNX bridge: an unavailable classifier/fallback to
   community review is expected. Phone/native runtime performance is not signed off.
4. Test invalid image, missing network and retry UX. Expect visible failure/pending
   states and preserved saved report, not fabricated scores. Background retries and
   the existing manual retry cooldown remain. Stale corrected boxes cannot reuse
   old model feedback or stale votes.
5. Community review: owner cannot review own report; ineligible/non-owner users
   cannot bypass seats. Three matching ALIVE/DEAD votes finalize that insect.
   UNCERTAIN does not finalize and frees the seat. Up/downvotes/flags are social
   actions, not alive/dead votes. Do not call legacy vote RPCs as substitutes.
6. Moderation: existing admin can correct/remove boxes, decide with a reason,
   reject or publish through the versioned facade. Stale versions require refresh.
   Changed insects need new decisions; siblings retain their own decisions.
7. Credits: **one credit per confirmed DEAD insect**, zero for ALIVE. Two confirmed
   DEAD insects in one fully finalized report yield two credits, not one. Pending,
   rejected/duplicate reports and model suggestions give zero. Existing publication
   requires all active insects final. Repeated refresh must not duplicate credits.
8. Check multi-insect summary, caption below it, one processing message, and the
   success popup on a qualifying published DEAD report. Popup deduplication is per
   user/report/device; it must not impose a per-report or per-device credit cap.

## Known discrepancies and expected failures

**Feed requirement remains unresolved.** Production client selects published only;
DB publication waits for all active insect decisions. Eligible reviewers can access
pending-review reports separately. Final requirement is feed publication only after
accepted lanternfly detection. Local pending-feed UI queries include pre-detection
uploads, but hosted RLS still restricts other members. Draft 17 would expose too
early and is unapplied. Do not accept either version as final detection-first
behavior or change production during this freeze. Passing feed tests currently
encode the earlier immediate-feed requirement.

The older production client may show different wording, duplicates or startup size
from local. Large badge/image assets remain in the export; a successful build does
not establish phone performance. Some older docs claim all migrations are deployed
or recommend draft 17; use the M2B audit and this freeze handoff instead.

## Locally implemented, inactive and unavailable

M1 adds immutable shadow state/provenance/credit foundations; migration 18 is not
hosted. M2A's isolated authenticated Node proof accepts exactly reportId, insectId,
revision and stores null-label raw observations through the M1 RPC. Every response
is shadow-only. No app button or automatic job invokes it. Locally tested security,
concurrency, numerical parity and resource results do not establish hosted success.

Automatic acceptance, calibrated new ALIVE/DEAD bands, provisional live credits,
contest APIs/UI/qualification, deadline processing and live hybrid integration
are **not active or not implemented**. Do not treat old `model_service/` or draft
16 as an enabled classifier service. Browser model observations remain untrusted.

## Remaining prerequisites and disable instructions

Shadow Preview requires authenticated Vercel project access, verified protection,
Node22/Linux x64 settings, server-only secrets, explicit enable flag, approved UUID
allowlist/test reports and deployment approval. Only separately approved migration
18 would be needed; it adds schema/triggers/backfill in the shared production DB.
Drafts 16/17 must stay unapplied; never bulk-push migrations. Hosted Auth, ownership/
admin/expired-token checks, private storage, revisions, repeat/concurrent requests,
resource limits and unchanged live state/credits still need controlled validation.

There is currently no new Preview to disable. A future enabled Preview must be
removed/disabled at deployment level; changing env alone does not revoke an old
immutable deployment. Keep the enable flag false outside that approved Preview.
Retain append-only evidence/live=false; do not automatically drop shared schema.
Production Git pushes can deploy: do not push/merge main as part of handoff.
