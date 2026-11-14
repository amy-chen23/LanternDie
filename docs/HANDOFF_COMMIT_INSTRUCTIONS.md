# Freeze inventory and selective commit instructions

Snapshot: November 13, 2026; branch `report-overhaul`, HEAD `ba8f3c8`.
At entry: **23 tracked modifications, 79 untracked files, no staged changes**.
The freeze adds only the three documents in the first group below. No existing
source, model, migration or application logic was edited. Labels below describe
scope, not permission to deploy. Do not infer unrelated authorship from Git status.
No unrelated personal work was positively identified; earlier prototypes and
superseded drafts are separated and preserved rather than deleted.

## Exact dirty-file ownership/scope inventory

`M` means modified tracked file; `??` means untracked. Every dirty source file at
the freeze is listed once. The app group includes the unresolved immediate-feed
client behavior; do not treat it as a release-approved implementation snapshot.

### Freeze documents (only proposed staging set) — 3 files

- `??` `docs/FRONTEND_HANDOFF.md`
- `??` `docs/HANDOFF_COMMIT_INSTRUCTIONS.md`
- `??` `docs/QA_RELEASE_HANDOFF.md`

### Current app, browser inference and UI work (preserve; not staged) — 39 files

- `M` `.github/workflows/check.yml`
- `M` `.gitignore`
- `M` `App.tsx`
- `M` `components/AdminAccess.tsx`
- `??` `components/CommunityApproval.tsx`
- `M` `components/CommunityReview.tsx`
- `??` `components/PublicationCelebration.tsx`
- `M` `components/ReportIdentification.tsx`
- `??` `hooks/usePublicationCelebration.ts`
- `??` `lib/classification-label.ts`
- `??` `lib/community-feed.ts`
- `M` `lib/community-review.ts`
- `M` `lib/death-assessment.ts`
- `??` `lib/death-runtime.web.ts`
- `??` `lib/death-worker.ts`
- `??` `lib/publication-celebration.ts`
- `??` `lib/report-photo-urls.ts`
- `M` `lib/report-processing.ts`
- `M` `lib/reports.ts`
- `??` `ml/verify_browser.py`
- `M` `package-lock.json`
- `M` `package.json`
- `??` `playwright.config.ts`
- `??` `scripts/build-inference.mjs`
- `??` `scripts/serve-web-test.mjs`
- `??` `tests/browser/inference.spec.ts`
- `??` `tests/classification-label.test.mjs`
- `??` `tests/community-feed-access.sql`
- `??` `tests/community-feed.test.mjs`
- `M` `tests/death-policy.test.mjs`
- `??` `tests/death-web-runtime.test.mjs`
- `??` `tests/fixtures/browser-inference/above.jpg`
- `??` `tests/fixtures/browser-inference/below.jpg`
- `??` `tests/fixtures/browser-inference/references.json`
- `??` `tests/publication-celebration.test.mjs`
- `??` `tests/report-photo-urls.test.mjs`
- `M` `tests/report-processing.test.mjs`
- `M` `tests/report-worker.test.mjs`
- `M` `vercel.json`

### M1/M2A/M2B shadow work (preserve; not staged) — 41 files

- `??` `docs/MILESTONE_1_TEST_RESULTS.md`
- `??` `docs/MILESTONE_1_VERIFICATION.md`
- `??` `docs/MILESTONE_2A_TRUSTED_INFERENCE.md`
- `??` `docs/MILESTONE_2B_DEPLOYMENT_PLAN.md`
- `??` `docs/TRUSTED_INFERENCE_FEASIBILITY.md`
- `??` `docs/milestone-2a-browser-parity.json`
- `??` `docs/milestone-2a-local-results.json`
- `??` `docs/milestone-2a-native-parity.json`
- `??` `docs/milestone-2a-package.json`
- `??` `docs/milestone-2a-pytorch-parity.json`
- `??` `docs/milestone-2b-readiness.json`
- `??` `docs/trusted-inference-deno-measurements.json`
- `??` `docs/trusted-inference-node-measurements.json`
- `??` `docs/trusted-inference-node22-measurements.json`
- `??` `docs/trusted-inference-tensor-parity.json`
- `??` `lib/verification-service.ts`
- `??` `lib/verification-state.ts`
- `??` `ml/verify_trusted_tensors.py`
- `??` `proofs/trusted-inference/.env.example`
- `??` `proofs/trusted-inference/README.md`
- `??` `proofs/trusted-inference/build.mjs`
- `??` `proofs/trusted-inference/entry.mjs`
- `??` `proofs/trusted-inference/errors.mjs`
- `??` `proofs/trusted-inference/handler.mjs`
- `??` `proofs/trusted-inference/package-lock.json`
- `??` `proofs/trusted-inference/package.json`
- `??` `proofs/trusted-inference/runtime.mjs`
- `??` `proofs/trusted-inference/service.mjs`
- `??` `proofs/trusted-inference/store.mjs`
- `??` `proofs/trusted-inference/test-fixture.mjs`
- `??` `proofs/trusted-inference/test-packaged.mjs`
- `??` `proofs/trusted-inference/test-runtime.mjs`
- `??` `scripts/feasibility/deno-wasm.mjs`
- `??` `scripts/feasibility/node-onnx.mjs`
- `??` `scripts/test-verification-compatibility.mjs`
- `??` `scripts/test-verification-concurrency.mjs`
- `??` `supabase/migrations/20261118000000_verification_foundations.sql`
- `??` `tests/browser/trusted-inference-proof.spec.ts`
- `??` `tests/trusted-inference-poc.test.mjs`
- `??` `tests/verification-foundations-access.sql`
- `??` `tests/verification-foundations.test.mjs`

### Existing worker/config changes (coordinate; not staged) — 4 files

- `M` `supabase/functions/.env.example`
- `M` `supabase/functions/process-report-jobs/index.ts`
- `M` `supabase/functions/process-report-jobs/processor.ts`
- `M` `supabase/operations/schedule-report-worker.sql`

### Earlier unused service/pipeline prototype (exclude from freeze commit) — 11 files

- `??` `.dockerignore`
- `??` `model_service/.env.example`
- `??` `model_service/Dockerfile`
- `??` `model_service/README.md`
- `??` `model_service/app.py`
- `??` `model_service/inference.py`
- `??` `model_service/requirements.txt`
- `??` `supabase/functions/process-report-jobs/classifier.ts`
- `??` `supabase/migrations/20261116000000_automatic_model_pipeline.sql`
- `??` `tests/automatic-pipeline-access.sql`
- `??` `tests/test_model_service.py`

### Superseded feed rollout artifacts (exclude from freeze commit) — 2 files

- `??` `docs/COMMUNITY_PENDING_FEED.md`
- `??` `supabase/migrations/20261117000000_community_pending_feed.sql`

### Supporting prior documentation (preserve; not staged) — 5 files

- `??` `docs/BROWSER_INFERENCE.md`
- `M` `docs/HUMAN_VERIFIED_BETA.md`
- `M` `docs/REPORT_PROCESSING_PIPELINE.md`
- `??` `docs/browser-model-verification.json`
- `M` `supabase/README.md`

## Must not be committed

Actual `.env` files, service-role/Roboflow/worker tokens, auth sessions, private
storage downloads, training work/checkpoint directory, local DB data/dumps,
`supabase/.temp/`, `node_modules/` (including nested proof dependencies), `.expo/`,
`dist/`, `web-build/`, `.vercel/`, `public/inference/`, `__pycache__/`, bytecode,
`playwright-report/`, `test-results/`, and temporary native packages/tensors/PG
clusters under `/private/tmp` must stay out. Do not force-add ignored paths.

Do commit the unchanged, already tracked model assets when an intentional future
source snapshot requires them; they are source artifacts, not accidental new
build output. The two untracked JPEG reference fixtures and references.json are
intentional model test inputs; retain them with browser tests in a future reviewed
source commit after confirming image provenance/privacy. Binary image contents
were not independently audited during this freeze. Placeholder-only `.env.example` files can be source; real
values cannot. Existing tracked badge/photos were not changed by this freeze.

The earlier prototype and superseded-feed groups are not approved for this freeze
commit. Keep them on disk. Draft 18 is legitimate M1 source but likewise excluded
from the documentation-only commit, and must not be applied by a bulk migration.
Do not stage other groups wholesale: the compatibility runner/CI reference some
prototype SQL suites, and app/UI changes depend on untracked helpers. A partial
implementation commit without dependency review can break a fresh checkout.

## Secret/artifact check

A best-effort content/path scan covered **192 non-ignored tracked/untracked candidate
files** before the three new handoff docs. It compared actual local secret values
(without printing them), checked private-key/provider-token/password-URL patterns
and service-role JWT payloads. No matches or unwanted candidate paths were found.
The normal index was empty. Generated web/worker assets, nested node_modules and
local configuration exist but are ignored; no local DB contents were found among
commit candidates. Binary model/image files were inventoried, not text-secret
scanned. This is a bounded scan, not a guarantee that every possible secret format
or binary payload is clean. Recheck the exact staged diff before committing.

## Exact recommended handoff commit — user executes, not run by the agent

This is intentionally a **documentation-only** commit. It does not transfer the
uncommitted implementation to a teammate's clone and does not make the whole
working tree clean or merge-ready. Until source is curated into separate reviewed
commits, QA/UI work must use this existing checkout or an explicitly coordinated
source snapshot. No blanket add, stash, reset, cherry-pick or automatic push.

First verify the branch prints `report-overhaul` and the staged-file list is empty.
If either differs, stop and coordinate; do not discard or unstage others' work.

```sh
git branch --show-current
git diff --cached --name-only
git add -- docs/QA_RELEASE_HANDOFF.md docs/FRONTEND_HANDOFF.md docs/HANDOFF_COMMIT_INSTRUCTIONS.md
git diff --cached --name-only
git diff --cached --check
git diff --cached -- docs/QA_RELEASE_HANDOFF.md docs/FRONTEND_HANDOFF.md docs/HANDOFF_COMMIT_INSTRUCTIONS.md
```

Review that exactly the three documents are staged. Then, if approved, run:

```sh
git commit --only -m "docs: freeze QA and frontend handoff" -- docs/QA_RELEASE_HANDOFF.md docs/FRONTEND_HANDOFF.md docs/HANDOFF_COMMIT_INSTRUCTIONS.md
git show --stat --oneline HEAD
git status --short
```

`--only` confines the commit to the explicit docs paths even if another index change
appears later. The final status should retain the previous development changes.
These commands have **not** been executed. Do not push, merge main or deploy.
A main push can trigger production. Even a branch push may create a Git Preview;
no push is authorized during this freeze.
