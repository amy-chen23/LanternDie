# Milestone 2B deployment readiness and approval checkpoint

Read-only audit: November 13, 2026. Status: **BLOCKED pending authenticated Vercel
project access and explicit hosted-change approval**. No migrations, deployments,
application-data writes, commits, pushes or merges were performed. The user also
confirmed that pushing main changes Vercel deployment; no Git-triggered release
is part of this plan.

This is the pre-deployment checkpoint, not the completed QA release handoff.
Phases 3–7 resume only after the environment is verified and the user approves the
specific hosted plan. No production app, existing worker or feed policy is to be
changed by the inference Preview.

## Audited sources

Reviewed MILESTONE_1_VERIFICATION.md, TRUSTED_INFERENCE_FEASIBILITY.md,
MILESTONE_1_TEST_RESULTS.md and MILESTONE_2A_TRUSTED_INFERENCE.md before changes.
Additional evidence: authenticated Supabase CLI migration history and SELECT-only
catalog/RLS/bucket/model metadata; deployed Edge-function metadata; public
production HTML/JavaScript; local working tree and proof build.

Machine-readable observations and reviewed file SHA-256 values are in
[milestone-2b-readiness.json](milestone-2b-readiness.json). No secret values,
private image data, user contact details or access tokens are included.

## Git and production application

Branch: `report-overhaul`; HEAD: `ba8f3c8` (human-verified beta checkpoint).
There are 23 modified tracked files plus substantial untracked work from prior
milestones: browser inference, feed changes, popup fixes, prototype workers,
M1 schema, M2A proof, tests and documentation. Nothing was stashed, reset, staged,
committed, pushed or merged. Do not use a blanket `git add .` or merge this working
tree as a release. Current branch is **not yet assessed as safe to merge**.

Current root `vercel.json` exports Expo `dist` and rewrites all paths to the app
shell. It must remain unchanged for this proof. A root `/api` route or a normal
Git deployment of the working tree would mix the proof with pending app changes.
The proposed endpoint uses its own external prebuilt function-only artifact.

Production `https://lanterndie.vercel.app/` returned HTTP 200. Its observed bundle
is `AppEntry-51202390c0d6fc8ea56492d85800223b.js`, 3,239,076 bytes, SHA-256
`31079d1bd3c69d47b2b98b77e528d42d72215befd62fade6c908507d25f8673d`.
It differs from the local export. Production source uses a published-only feed
query and has no `/api/shadow-inference` reference. A successful shell response
is not a multi-account workflow, browser-inference, or QA sign-off.

## Hosted Supabase: verified facts

Linked project: **LanternDie**, ref `qnkwsnobdgfhgkuisdpp`. Hosted PostgreSQL:
**17.11**. Remote migration history matches local migrations through
`20261115000000`; versions **16, 17 and 18 are unapplied**.

- `reports`, `report_insects`, `report_identifications`, `report_photo_hashes`, and
  `death_model_versions` exist with RLS enabled.
- The nine M1 shadow tables and `record_trusted_model_prediction` are absent.
  M2A cannot persist a hosted trusted observation until M1 is approved/applied.
- `get_my_admin_status` is security-definer, executable by authenticated only;
  anon and service-role execution are denied. The proof correctly uses user JWTs.
- `complete_report_processing` is service-role only. The new pipeline prototype
  RPCs/table/checkpoint columns are absent; migration 16 is not a dependency.
- `report-photos` is private, JPEG-only, max 5,242,880 bytes. Existing SELECT policy
  follows ownership/accessible report rows. No policy is changed in this plan.
- The unchanged ONNX SHA is registered as `lanternfly-dead-v1`, preprocessing
  `padded-rgb-pillow-bilinear-v1`, legacy threshold 0.98.
- Existing functions: `identify-report` ACTIVE v5, gateway JWT check on;
  `process-report-jobs` ACTIVE v2, gateway JWT check off (existing worker-secret
  boundary). Neither was invoked, redeployed, reconfigured or source-validated
  against its live artifact in this audit.

These are current hosted metadata checks. M1's future RLS/RPC grants are locally
tested definitions, not currently deployed permissions.

## Feed discrepancy: separate release issue

Hosted draft 17 is **not deployed**. Current hosted report RLS allows owners,
admins, published reports and pending-review reports to eligible active reviewers.
The production client's community feed additionally selects published reports only.
The actual hosted `private.reconcile_report` requires active insects to exist,
all labels final, insects ready, and a registered photo hash before publishing;
credit equals the confirmed DEAD insect count.

The finalized requirement is **feed publication after accepted lanternfly detection**.
Current production is more restrictive: public-feed publication follows final
life-status decisions. The local branch/draft 17 goes further in the other direction:
`lib/community-feed.ts` includes `pending_detection`, and draft 17 grants visibility
before detection. Local tests explicitly assert this older behavior, so passing
tests do not establish conformity to the finalized requirement.

Neither behavior is silently changed here. Do not apply draft 17, promote the
pending-feed client, or treat docs/COMMUNITY_PENDING_FEED.md's older rollout
instructions as current authorization. A separate reviewed detection-first client/
RLS change and updated tests are required before the final product release.

## Vercel readiness: still unverified

No authenticated Vercel tools/CLI credentials or local `.vercel` project link were
available at audit time. Browser fallback was unavailable because computer-use
permissions were not granted. The Vercel integration was requested; the user said
access would be enabled, but a usable connection has not yet been confirmed.

Before deployment approval can be actionable, read and record:

1. Exact existing project/team IDs serving the production domain; Git production
   branch and deployment behavior. No new project/team is to be created.
2. Current Preview protection and authorized QA access. A protected Preview is
   mandatory; do not assume an obscure URL is protection or buy an add-on.
3. Available Preview-only server variables **by name/scope only**, existing Supabase
   target, Node22/x86_64 support, function region, duration/memory/plan limits.
4. Whether existing project settings permit the isolated prebuilt artifact without
   changing root build settings or the production application. Do not modify global
   Node settings, production environment variables, domains or Git integration.

If protection or safe isolation is unavailable on the existing infrastructure,
stop and report it. Do not weaken auth or introduce paid infrastructure.

## Exact proposed hosted changes — NOT authorized yet

### Database: only Milestone 1, and only with separate explicit approval

Required file: `supabase/migrations/20261118000000_verification_foundations.sql`.
Reviewed SHA-256:
`6bcdfa10ef9f39e7a69af4aa0b6b52c8596217b68603b1001ec7e3cbe935e97f`.
No new competing schema is needed. Drafts **16 and 17 must remain unapplied**.
Do not run a bulk `supabase db push`, include-all migration command, or automatic
migrate-on-build. Version 18 does not depend on 16 or 17.

M1 adds nine tables, restricted provenance/shadow RPCs, RLS/constraints, immutable
history, a live-disabled flag, and revision-capture/backfill logic. It seeds null
acceptance bands and disabled automatic acceptance. It does not alter existing
labels, voting/credit logic, or existing feed policies.

**The linked DB is shared with production.** Applying M1 changes that shared schema,
adds triggers for future insect revisions and backfills new shadow snapshots.
It is not a database-isolated Preview. Approval must explicitly include that shared
DB mutation, not merely deploying a Vercel Preview. If the user requires a separate
DB target, identify an existing safe target first; do not create a paid branch.

Proposed application method after approval: stage the unchanged, checksummed M1
SQL in an explicit transaction with bounded lock/statement timeouts; assert baseline
history through 15, drafts 16/17 absent, 18 absent and no partial shadow objects;
execute only that SQL; insert only version `20261118000000` / name
`verification_foundations` into `supabase_migrations.schema_migrations` in the same
transaction (the hosted history columns were inspected). Record the original SQL
as its statements array. Commit only if every step succeeds. On an exception,
rollback the transaction; do not repair history to hide a partial failure.
The exact staged transaction must be inspected again before executing.

Immediately re-read table RLS/RPC grants, live=false, null bands, null prediction
labels, immutable keys, existing publication function/policies and credit snapshots.
No test records, role assignments or storage mutations are implied by schema approval.

### Vercel: one isolated protected Preview

Reuse `proofs/trusted-inference/{entry,handler,service,store,runtime,errors}.mjs`,
its package/lockfile, unchanged model and metadata, and `lib/death-policy.ts`.
`build.mjs` generates a new external `.vercel/output` containing only:

- `functions/api/shadow-inference.func/index.mjs`;
- private unchanged ONNX model;
- pinned JPEG and ORT runtime JS, Linux x64 CPU binding/library and notices;
- function config: Node22, x86_64, 30-second max, Nodejs launcher, helpers off;
- routing config: function filesystem route and 404 fallback; no static assets.

The fresh audited Linux directory is 40,235,871 bytes (~38.4 MiB), same as M2A.
It was built/inspected, not executed on Linux or deployed. The target artifact path
and source fingerprints are in the readiness JSON. Rebuild if reviewed source
changes; do not deploy a macOS local-test artifact.

After protection and project identity are confirmed and approval is granted,
associate only the external temporary work directory with the existing project and
upload that Linux artifact as **Preview**, never `--prod`, alias/promote, a Git push,
or a root app deployment. No root application file/configuration is necessary.

Server configuration for that Preview/deployment only:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`TRUSTED_INFERENCE_ALLOWED_USER_IDS`, `TRUSTED_INFERENCE_POC_ENABLED=true`.
Require Vercel's real `VERCEL=1` and `VERCEL_ENV=preview`; inspect system-variable
availability. Use existing server-only credentials through approved secret settings;
do not place values in docs, command-line arguments, source or frontend variables.
Production enable flag stays absent/false. A nonempty approved UUID allowlist is
required before enabling. Use existing owner, DB admin and cross-user QA accounts;
no accounts/roles are created or assigned without separate approval.

Requests: authenticated POST `/api/shadow-inference`, exactly reportId/insectId/
revision. The server resolves all geometry/paths, verifies private image hash,
runs the unchanged padded 224×224 model and saves through the M1 provenance RPC.
All results are shadow-only, null life-status label. No automatic jobs, state
transitions, verification decisions, provisional credits or leaderboard writes.

## Controlled hosted test plan after approval

Use approved existing test reports/images and accounts, not arbitrary user reports.
Record raw score, model/preprocessing version, source hash, revision, runtime,
provenance, prediction ID and inference/recording timestamps without secrets.
Check real owner/admin/other-user and expired-token behavior; missing authorization,
non-allowlisted access, rejected report, invalid detection, stale revision, extra
paths/boxes/scores, private storage errors, invalid JPEG and size/deadline limits.

Repeated and concurrent identical requests must return one immutable prediction ID;
different instances may duplicate computation but must reconcile one DB winner.
Snapshot existing labels, verification states and credits before/after. Do not
manufacture failure cases by corrupting existing reports/images; any dedicated
fixture creation/modification must be listed and approved first.

Measure real Vercel/Linux model load, first observed and warm request latency,
platform memory/runtime limits and bundle metadata where available. Label a first
observed request honestly unless a genuine platform cold start is evidenced.
Local M2A timings are not hosted evidence. If any required security/integrity check
fails, disable/remove the Preview and document the failure; do not bypass checks.

## Disable/rollback plan

Disable the inference Preview through Vercel's deployment controls/remove that
specific Preview; revoke any deployment-specific protection bypass credential if
one was approved. If enabling used Preview-scoped project variables, set the flag
false and redeploy the isolated Preview; changing env settings alone does not
retroactively update an existing immutable deployment. Remove/delete the old
Preview so its old enabled URL cannot continue serving. Do not promote or roll
production back as a way of disabling this independent Preview.

Retain append-only shadow evidence and M1 schema with live=false. Do not drop shared
schema/trigger objects or delete history as an automatic rollback. Any schema
rollback requires its own reviewed dependency/backup plan and approval. Inference
failure requires no live-label/credit reversal because the endpoint cannot grant
those decisions. Rotate a credential only if there is actual exposure, not as a
routine disable step.

## Checkpoint and deferred deliverables

Fresh local preflight: **89 unit tests passed**, typechecking passed, Linux function
package reproduced. M2A native/PyTorch/browser/real local PostgreSQL evidence remains
in its handoff; no source inference changes were necessary in this audit.
Hosted function execution/Auth/Storage/concurrency remain **NOT TESTED**.

This milestone currently adds only this plan and `milestone-2b-readiness.json`.
No previous source file was changed. `QA_RELEASE_HANDOFF.md`, `FRONTEND_HANDOFF.md`,
restricted QA invocation tooling, full release regressions and final merge-readiness
assessment are deferred to the requested post-approval phases. No full hybrid
engine, contest implementation or provisional-credit rollout is included.

Approval must ultimately identify the exact protected Preview project/deployment
scope, approved test identities/reports, and whether shared-DB M1 application is
included. Vercel identity/protection is still a blocker, so no hosted action is
currently ready to execute. Once access is verified, present the completed plan
and request approval before making any hosted changes.
