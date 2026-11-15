# Release validation — November 14, 2026

**Local browser/model integration is suitable for supervised QA. This is not a
complete production release sign-off.** Tested `report-overhaul`, HEAD `afb8d14`
(also local main), plus the existing uncommitted work. No commit, push, deployment,
migration, live vote or report mutation occurred during this validation. Earlier
milestone/handoff documents describe historical snapshots; these are the current
test results. Machine-readable evidence: [release-validation.json](release-validation.json).

## Model and verification requirements preserved

- Original PyTorch state-dict checkpoint, architecture (MobileNet V3 Small features,
  adaptive pooling, linear 576→1), and bundled ONNX are unchanged. No retraining.
  Checkpoint SHA: `99c557bad5862504641bd09284ef1ec3b50fb885ca1b5f40ea13a2cc0994bd85`.
  ONNX SHA: `57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`.
- Existing 15% padded crop, Pillow-compatible bilinear aspect fit, centered
  RGB(124,116,104) background, 224×224 NHWC float RGB input and graph-contained
  ImageNet normalization/sigmoid remain. Preprocessing identity remains
  `padded-rgb-pillow-bilinear-v1`; model identity remains `lanternfly-dead-v1`.
- Uncalibrated dead score cutoff remains **0.98**, inclusive. Model feedback is
  LIKELY DEAD at/above it, UNCERTAIN below. Lower scores do not imply ALIVE.
  Final community/admin decisions display DEAD or ALIVE. Automatic verification
  remains disabled; browser observations cannot grant acceptance or credits.
- Owner inference follows accepted Roboflow detections. Roboflow is the explicitly
  permitted external detector; the classifier stays local. Browser inference,
  JPEG decoding and preprocessing run in a dedicated worker, loaded lazily.
  ONNX, runtime module and WASM are same-deployment assets, with no CDN fallback.
  Python/PyTorch and Node inference bindings are not bundled into the frontend.
- Failed initialization, invalid images, dimensions, missing/corrupt assets and
  explicit retry are covered. Cached scores require the correct detection/model
  snapshot. A corrected crop cannot inherit stale feedback. The open results modal
  updates with the cards. Saved failures do not loop automatically on remount.
- Existing review eligibility, owner exclusion, five seats, three matching decisive
  responses, revision checks and UNCERTAIN handling are retained. Social up/downvotes
  remain separate from review responses. **One confirmed DEAD insect earns one
  credit**, including multiple DEAD insects per report; no model/provisional credits.
- The isolated trusted Node proof remains shadow-only and inactive. Auth, ownership,
  revision/source identity, provenance and idempotency checks remain covered. Its
  model is private to its separate function artifact; the intentionally public
  browser model is unchanged. No new root API, service or cloud infrastructure.

## Main UI and subsequent requested changes preserved

Source comparison against main and production-browser tests cover Home/Sightings
navigation, Explore/My submissions/Needs review, filters/help, owner menus,
edit/save/refresh, delete confirmation and removal from Explore, author avatars,
photo results, profile points, and social-vote controls. Main's PageHeader,
Roboto typography, rounded layouts, authentication, badge and leaderboard source
remain in place. Tests do not establish every badge or OAuth-provider flow on a
real account; those still need hosted exploratory QA.

The requested grouped classification summaries and captions beneath them remain.
Cards are green for final DEAD, yellow for ALIVE/UNCERTAIN, and red for rejection
(rejection wins). Earned Points/Pending/No Points filters use actual credits;
leaderboard counts say POINT/POINTS. The publication celebration and deduplication
logic remain, with unit coverage. Development UI tests check the earlier native-only
SVG property warning does not recur.

Explore's eligible non-owner review panel asks “Is this lanternfly alive or dead?”
and offers Alive/Dead/Uncertain. It claims a seat only on response, saves against
the current insect/revision, shows Thanks!, then hides while retaining the post.
Tests cover double-clicks, multiple insects, reload, save errors, full seats,
stale revisions and self-review exclusion. Needs review remains available.

## Fresh validation results

- Node **22.16.0**: **109 unit tests**, typecheck and production web export passed.
  A separate clean source copy also passed `npm ci --offline`, tests, types and export.
  Typecheck passed again after the new QA configuration/test changes.
- **62 production browser tests passed**, zero skipped/flaky: Chromium desktop,
  Chromium 390×844 touch, WebKit 390×844 touch, Firefox desktop. The Chromium-only
  CDP throttle check is excluded from the other engines. It tests 4× CPU slowdown,
  120 ms latency, 500 KB/s download, sign-in readiness within 20 seconds, app JS
  below 1.3 MB, and zero inference requests during initial startup.
- **5 development-mode UI tests passed**, including the React/SVG regression check.
  Auth/REST/Storage transport is intercepted in browser UI tests; actual ONNX graph,
  worker, preprocessing and runtime assets run. No hosted application data is written.
- **13 Python training/preprocessing tests passed.** A fresh export in the isolated
  copy and the bundled ONNX each matched original PyTorch across **83 reviewed
  crops**, max absolute error **2.2054e-6**, zero 0.98 decision mismatches. Original
  model assets and repository fixtures were preserved.
- Four identical Node-prepared full/interior crop tensors matched PyTorch within
  **4.1724e-7**. All four browser configurations matched native ONNX scores within
  **3.5763e-7**, with zero threshold decision mismatches. Boundary tests separately
  cover exactly 0.98 and values on either side.
- **13 SQL suites passed** on disposable local PostgreSQL **18**, including the main
  avatar/author-vote migrations and M1 compatibility checks. Four concurrent credit
  retries yield one event; two decision attempts yield one commit and one stale
  rejection. Hosted PostgreSQL is **17.11**; CI targets 17, but CI was not executed
  here and local 18 testing is not a substitute for that exact-version check.
- Existing Edge functions passed **Deno 2.9.6** typechecking.
- The packaged shadow proof passed again on local macOS ARM64 Node22, stubbed
  Auth/Storage and real disposable SQL: 25 auth checks, repeated/concurrent requests,
  single prediction winner and unchanged report/insect/vote/live-credit snapshots.
  First inference request ~278 ms, warm p50/p95 ~144/151 ms, peak RSS ~289 MiB.
  These are local measurements under concurrent QA load, **not Vercel cold-start
  or Linux-hosted evidence**. The previously built artifact was reused for this test.
- `git diff --check` passed; no unmerged or staged paths. Prior development source
  was retained. Secret-pattern/artifact scans and comparison against the existing
  private detector key found no credentials or local DB/build files in commit
  candidates or leaked private values in the exported assets. This is a bounded
  scan, not a guarantee of complete security coverage.

The initial Firefox missing-WASM test exposed request interception bypass in its
worker loader. The test server now returns a real HTTP 404 at an isolated test
path, and all four configurations pass. No application behavior was changed for
this correction. Browser/native parity evidence is attached per project rather
than overwriting the desktop evidence with a differently named engine.

## Asset and dependency findings

App JS is **1,090,733 bytes** uncompressed; full static export ~37.9 MB. Inference is
downloaded on demand: ONNX 4,142,697 bytes, WASM 12,361,745 bytes, runtime module
24,274 bytes, worker 99,328 bytes. These assets export correctly and model checksums
match. First classifier use still needs the ~16.6 MB runtime/model download; physical
phone timing is unverified. Existing image/font assets account for other export size.

Root `npm audit --omit=dev` reports **4 moderate**, **0 high/critical** findings in
Expo CLI/fingerprint's glob/minimatch dependency chains. They are build tooling;
the deployed static client does not execute those CLI tools. No forced/major
dependency upgrade was applied during this preservation audit. Track compatible
Expo/tooling remediation before treating dependencies as fully clean.

## Remaining release gaps and approval boundaries

1. **Detection-first feed requirement is not satisfied end to end.** The current
   production client selects published reports; DB publication waits for every
   active insect's final decision. The local client still includes pre-detection
   statuses, and draft migration 17 would expose them too early. Hosted RLS restricts
   pending access to eligible reviewers. Passing local tests do not resolve this
   policy mismatch. The new inline panel works only on reports the user can access.
   A separately reviewed client/RLS correction is required; do not apply draft 17.
2. **Main's community-avatar policy migration `20261113183128` is still unapplied**,
   confirmed by fresh read-only history. UI source is preserved, but hosted community
   photos cannot be signed off from intercepted Storage tests. Author-vote migration
   `20261113183923` is applied. Do not bulk-push outstanding migrations.
3. **Hosted trusted inference is unvalidated and disabled.** M1 migration 18 remains
   unapplied; drafts 16/17 remain unapplied and must not be substituted. Approved
   shared-DB schema work, authenticated Vercel project/protection inspection,
   Preview-only server secrets/allowlist, explicit deployment approval and real
   Vercel/Linux Auth/Storage/resource/concurrency tests are still required. See
   [M2B plan](MILESTONE_2B_DEPLOYMENT_PLAN.md). A main push alone does not enable it.
4. **Physical-device and hosted multi-account QA remain outstanding.** Browser
   emulation is not an installed native build. Expo Go lacks the native classifier
   bridge (deferred by the user); custom builds require device testing. Real Google
   sign-in, upload→detector→review→credit, avatar access and account-switch behavior
   need approved QA identities/reports on the deployed configuration.
5. **Release selection remains necessary.** Preserve all uncommitted work, but do
   not blanket-stage prototype `model_service/`, draft migrations, generated output,
   local `.env`/Supabase temp credentials or training data. Existing handoff staging
   instructions predate the main merge and must be reconciled before a commit.

Root Vercel configuration remains a static Expo export with same-origin inference
assets and its existing SPA rewrite. No Python runtime, endpoint or migration needs
to run in the static build. Local serving verifies assets, not the actual Vercel
project configuration or deployment. Pushing main can trigger production deployment:
**wait for the user's explicit release approval**. Nothing was committed or pushed.

## Repeat the browser matrix

With Node22 and the existing public Supabase URL/anon key configured:

```sh
npm ci
npm test
npm run typecheck
npm run build:web
npx playwright install chromium webkit firefox
npx playwright test --config playwright.qa.config.ts
```

Browser UI network calls are intercepted by the tests. Manually running the normal
app with the shared Supabase configuration does access the real database.

This audit added `playwright.qa.config.ts`, expanded the main UI edit/delete test,
made missing-asset failures cross-engine reliable in the test server/inference
tests, retained per-engine parity evidence, and added this report plus its JSON.
No product, model, live verification, voting, credit or migration source was changed
by this audit. Private raw logs/clean-copy outputs remain in
`/private/tmp/lanterndie-release-qa-ka84ilt7/`; they are not commit candidates.
