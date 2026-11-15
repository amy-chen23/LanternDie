# Local browser classifier integration

> Release caveat: the local feed query includes pending uploads, but hosted RLS
> still restricts access. The final detection-first feed policy is unresolved.
> Do not apply the superseded pending-feed migration. See
> [release validation](RELEASE_VALIDATION.md) for current deployment limitations.

Implemented November 13, 2026. No deployment or hosted database change was performed.

## Findings before integration

- `confidence-training/_work/model/classifier.pt` is a 3,837,723-byte dictionary
  checkpoint, loaded using `torch.load(..., weights_only=True)`. It contains
  `state_dict` and architecture/preprocessing metadata, not a pickled executable
  model. Its SHA-256 is
  `99c557bad5862504641bd09284ef1ec3b50fb885ca1b5f40ea13a2cc0994bd85`.
- `ml/confidence.py` uses a frozen ImageNet MobileNet V3 Small feature extractor,
  adaptive average pooling, and flattening to 576 features. It trains
  StandardScaler + logistic regression (`C=0.1`, seed 42), with three grouped
  stratified validation folds. The final fit folds the scaler and logistic
  coefficients into a `Linear(576,1)` PyTorch head. The reviewed training set has
  83 crops (30 alive, 53 dead). The backbone is not retrained.
- Training input is RGB, EXIF-transposed, aspect-preserving bilinear resized and
  center-padded to 224×224 with RGB `(124,116,104)`. RGB values are divided by 255
  and normalized with ImageNet mean `(0.485,0.456,0.406)` and standard deviation
  `(0.229,0.224,0.225)`. The detector sees the application's saved JPEG (longest
  edge at most 1600, JPEG quality 75). Individual boxes receive 15% padding on each
  side, clamped to the photo, before the classifier resize.
- Class encoding is alive=0, dead=1. The scalar sigmoid of the head's logit is
  the **uncalibrated dead score**. It is not softmax, detector confidence, or a
  calibrated probability. A low score remains **uncertain**, not confirmed alive.
- The registered application cutoff in `assets/models/policy.json` and
  `20261107000000_death_assessments.sql` is **0.98**, inclusive (`score >= 0.98`).
  `0.70` in early training metrics/export metadata is an experimental historical
  cutoff, superseded by the provisional policy chosen from out-of-fold scores.
  Automatic verification remains **disabled** pending independent validation.
  Both high and low scores continue to human review; no client score awards credit.
- An ONNX export already existed in `assets/models/lanternfly-dead.onnx`, alongside
  export scripts (`ml/export_mobile.py`, `ml/bundle_mobile.py`), metadata, policy,
  Pillow-compatible JS resizing, native ONNX inference, and shadow storage RPCs.
  The web runtime was a disabled stub and the current UI did not invoke local
  scoring. Pending uncommitted work instead called a hosted classifier service.
- Uploads are normalized to JPEG, saved to private Supabase storage, and inserted
  as reports. Durable jobs perform exact-image deduplication and existing
  Roboflow detection. Valid boxes create pending insects. Three matching decisive
  community labels finalize an insect; uploaders cannot self-review. Admin
  corrections/overrides remain authoritative. Reports publish after all active
  insects are final; dead insects award committed credits used by rankings.

The user explicitly approved preserving existing Roboflow detection. Photos still
reach that existing detector, but **never a classifier provider**.

## Architecture and behavior

The existing upload, authentication, and voting flows remain in place. When an
owner's report card receives a completed detection snapshot, it invokes
`assessReportLocally`. A browser-only runtime starts one module Web Worker;
JPEG decoding, Pillow-compatible resizing, model initialization, self-test, and
WASM inference all run there. The worker serializes predictions and reuses its
session. The UI remains responsive and shows photo-check progress/retry status. Checks wait
1.5 seconds for the screen to settle, then serialize photo downloads and inference
so report cards do not start competing downloads on phones.

ONNX receives float32 NHWC `[1,224,224,3]` RGB values in `[0,255]`; normalization,
NHWC-to-NCHW conversion, and sigmoid are embedded in the graph. Do not normalize
again. Its output is `dead_score`, shape `[1,1]`.

All worker/model/runtime URLs are same-origin under `/inference/`. The pinned
`onnxruntime-web@1.24.3` WASM build uses one thread, without proxy workers,
SharedArrayBuffer, WebGPU, or cross-origin-isolation headers. It has no CDN fallback.
This follows the runtime's [deployment guidance](https://onnxruntime.ai/docs/tutorials/web/deploy.html).

Before inference, the worker verifies the model checksum and runs the existing
all-zero reference prediction. Invalid JPEGs, oversized files, invalid boxes,
dimension mismatches, missing/corrupt assets, invalid outputs, worker crashes,
and timeouts fail without producing fabricated scores. Failed initialization
can be retried. Assessment failures are saved through the existing RPC as failed
observations; they do not prevent human review. UI retry also covers save failures.

The existing owner-only `save_death_assessment` RPC validates ownership, detector
snapshot, model registration, score count/range, and applies the server's 0.98
threshold. Scores remain untrusted shadow observations, hidden from other
reviewers. Completed observations cannot be overwritten; stale detector snapshots
cannot be saved. The UI matches suggestions to the original box geometry so admin
box corrections do not inherit another crop's suggestion.

The active detection worker uses the original `claim_report_processing_job` and
`complete_report_processing` RPCs. It never calls `classifier.ts` or a model
service, and never waits for the owner to return. The pending service prototype
(`model_service/`, `classifier.ts`, migration `20261116000000`, and its SQL test)
is retained as pre-existing work, but is **unused and not required** by this
integration. Do not deploy that service or configure CLASSIFIER secrets.

## Conversion and verification

The registered ONNX model is retained byte-for-byte (4,142,697 bytes; SHA-256
`57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`).
Changing it unnecessarily would invalidate the existing database model registry.

`ml/verify_browser.py` loads the original architecture with strict state-dictionary
validation, creates and checks a fresh opset-18 ONNX export in a temporary
directory, and compares **both** that export and the registered app model against
PyTorch on identical inputs from all 83 reviewed crops. The original checkpoint
is checksum-checked before and after. No retraining or weight changes occur.

Results recorded in `browser-model-verification.json`:

- 83/83 real crops pass `atol=1e-5, rtol=1e-5` comparisons.
- Maximum absolute error for both exports: **0.000002205371856689453**.
- **Zero** threshold-decision mismatches at 0.98.
- No conversion incompatibilities encountered.
- Local verification used PyTorch 2.15.0 and ONNX Runtime 1.32.0; Chromium tested
  the separately pinned deployment runtime 1.24.3.

The verification script also emits two small real JPEG crop fixtures, one on each
side of the cutoff, with PyTorch reference scores. Browser tests compare these
against actual WASM predictions and verify identical threshold decisions. They
allow absolute score difference below 0.001 because independent JPEG decoders can
produce slightly different RGB pixels. Identical prepared tensors use the much
stricter tolerance above. Pillow resampling is separately checked using six golden
pixel digests. Scores close enough to a cutoff can in principle cross it due to
floating-point/decoder differences; no automatic approval occurs in this policy.

## Tests and QA

Executed locally:

- `npm run typecheck` and Deno checks for both Supabase functions — passed.
- `npm test` — 56 tests passed, including initialization reuse/recovery, malformed
  replies, unsupported browser handling, threshold equality and adjacent values,
  policy routing, preprocessing, and detector worker regressions.
- `python -m unittest discover -s tests -p 'test_confidence*.py'` — 13 passed.
- `python ml/verify_browser.py` — all 83 comparisons passed.
- `npm run build:web` — passed; static assets appear in `dist/inference`.
- `npm run test:browser` — 8 Chromium tests passed: real inference on both sides
  of the threshold, invalid JPEG/dimensions, missing ONNX/WASM, corrupt ONNX,
  production sign-in screen, session reuse, and a responsive page during inference.
  The inference test verifies every network request is same-origin. A phone-sized
  startup test throttles the CPU 4× and network to 500 KB/s with 120 ms latency,
  verifies the sign-in screen opens, enforces a 1.3 MB JS budget, and confirms no
  inference assets are downloaded on the sign-in screen.
- Local PostgreSQL report-overhaul, identification-access, and
  death-assessment-access, report-processing-access, and community-review-access
  suites passed, including RLS, private scores, stale
  snapshots, community routing, admin corrections, credits, and voting restrictions.

CI builds the production app and runs Chromium tests after installing its browser.
The training dataset/checkpoint remain ignored by git; full PyTorch verification
requires the original local `confidence-training/` directory and Python packages
from `ml/requirements-mobile.txt`. No Python packages are shipped to Vercel.

Authenticated end-to-end uploads, voting, badges, and ranking screens against the
hosted project still require external QA with real test accounts. These checks
were not performed against production or claimed as completed.

## Vercel rollout

Keep the existing build command `npm run build:web` and output directory `dist`.
The npm prebuild script bundles the worker with esbuild and copies the verified
model plus the matching runtime `.mjs` and `.wasm` into `public/inference`; Expo
copies those into the exported deployment. Generated files are gitignored and
regenerated on clean builds. `npm run web` prepares the same files for development.
No serverless inference function, Python runtime, new model secrets, database
migration, additional hosting, or paid infrastructure is required.

`vercel.json` adds revalidation and `nosniff` headers for inference assets. Existing
SPA rewrites remain: Vercel gives existing static files priority over rewrites,
per its [configuration documentation](https://vercel.com/docs/project-configuration/vercel-json).
The worker uses fixed root-relative paths; deployment under a custom URL subpath
would need matching URL changes. Current Vercel root deployment is supported.

Uncompressed inference assets are approximately 15.9 MiB: model 3.95 MiB, WASM
11.79 MiB, worker 97 KiB, runtime glue 24 KiB. They load lazily on first assessment,
separate from the approximately 1.0 MB application JS bundle (previously 3.2 MB). Browser memory and
latency on low-end phones, Safari, and Firefox have not been measured. A working
network connection is needed for the first asset load and storage/RPC access.
Closing the page pauses local classification; reopening the owner's report cards
resumes missing assessments. Durable detection and community review continue.

After deploying the matching frontend (and the detection-only worker if replacing
the pending hosted-classifier version), check that `/inference/death-worker.js`
and `.mjs` return JavaScript, `.wasm` returns `application/wasm`, and ONNX returns
binary content rather than the SPA HTML. Run the same high/low/invalid-image QA
cases on the actual Vercel URL. This local validation is not a hosted deployment
smoke test.

## Files changed for this integration

- Added `lib/death-runtime.web.ts`, `lib/death-worker.ts`, and
  `scripts/build-inference.mjs` for browser inference and static packaging.
- Updated `components/ReportIdentification.tsx` to initiate owner assessments and
  show classification labels/progress/retry; removed the pending hosted-assessment
  read dependency from `lib/reports.ts`.
- Updated the active report worker entry point/processor to complete detection
  independently of classifier hosting; removed classifier secrets from the example.
- Added `ml/verify_browser.py`, the verification JSON, and real JPEG golden fixtures.
- Added browser/adapter tests and extended threshold/worker tests, plus a test
  server, Playwright config, and CI browser verification.
- Updated npm dependencies/scripts/lockfile, `.gitignore`, `vercel.json`, and
  workflow documentation. Marked the pre-existing service README as unused.
- Preserved `.pt`, bundled ONNX/metadata/policy, native runtime, database voting
  rules, threshold, and automatic-verification settings.

## Phone startup and simplified results update

The root Lucide import pulled the entire icon catalog into Metro. Seven public
per-icon imports reduce the production app from about 3.2 MB / 2248 modules to
about 1.02 MB / 392 modules. No icon artwork or app features were removed.

Home startup no longer waits for the activity heartbeat or eagerly loads the
community feed. That feed loads when opened, and still refreshes on resume while
visible. Background classification refreshes reports quietly, reusing photo URLs.

Report decoration previously downloaded every original image and converted it to
base64 before returning any cards. It now requests one batch of one-hour signed
URLs in parallel with report metadata; images load independently in the image
views. Valid URLs are reused until shortly before expiry and renewed on refresh.
The private bucket and existing Storage RLS remain unchanged. This uses the
existing [Supabase signed URL API](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls),
without paid image transformations or another image service. A missing image URL
does not suppress the report's metadata or classification.

Results in report cards, photo results, and review views use only DEAD, ALIVE,
LIKELY DEAD, or UNCERTAIN. Final dead/alive labels override model suggestions.
Pending boxes with a valid current score >=0.98 show LIKELY DEAD; otherwise they
show UNCERTAIN. Stale snapshots and corrected boxes cannot inherit old suggestions.
Numeric scores, detection confidence/cutoff, source wording, and vote-count/model
feedback were removed from these result views. Voting controls and server voting
rules remain unchanged; admin moderation retains its diagnostic details.

This verifies build size and emulated mobile startup, not measured performance on
the user's physical phone or deployed Vercel site. The original 2048×2048 artwork
is preserved; image asset size can still contribute to slow-network loading.
