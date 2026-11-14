# Milestone 2A: isolated trusted inference proof

Implemented and tested locally November 13, 2026. **No endpoint, database migration,
or configuration was deployed.** No live classification, voting, verification,
leaderboard or credit code was changed. Existing uncommitted work was preserved.

## Readiness recommendation

**Ready for an explicitly approved, allowlisted Vercel Preview validation**, after
checking the existing project's settings and reconciling its migration history.
Not ready for production activation, automatic verification or provisional credits.
The Linux CPU package was built and inspected; actual Linux loading, the Vercel
launcher, hosted Auth/Storage and hosted execution limits remain unverified.
A local packaged-handler test is not successful hosted execution.

## Architecture and request boundary

`proofs/trusted-inference/entry.mjs` exports a Node IncomingMessage/ServerResponse
handler for a future `POST /api/shadow-inference`. It lives outside root `/api`,
the Expo entry point, and active workers. The existing root `vercel.json` was
not changed in M2A. There is no application caller, schedule or automatic trigger.

1. The server defaults to disabled. Enabling requires a nonempty server-side user
   UUID allowlist plus three Supabase settings. Vercel execution is Preview-only;
   production is explicitly rejected, even if the enable flag is true.
2. Accept a Supabase bearer access token and exactly `reportId`, `insectId`, and
   positive integer `revision` in <=1 KiB JSON. Reject client paths/URLs, crop
   coordinates, scores, labels, provenance, extra fields and compressed bodies.
3. Validate the access token with **Supabase Auth `/auth/v1/user`**, not JWT decoding.
   Require an allowlisted user who owns the report or is an existing DB admin.
   Admin discovery calls `get_my_admin_status` with the **user token**, not the
   service key. Cross-user/non-admin requests receive a generic 404 before any
   image download or native session initialization. Replays repeat these checks.
4. Using the server-only service key, read the current report, active insect box
   revision, accepted detector result, dimensions, registered image SHA-256,
   registered model/preprocessing version and M1 live-disabled settings.
   Reject rejected/not-yet-detected reports, stale/inactive revisions, invalid
   geometry and boxes not exactly present in the current detector result. A manual
   box correction requires a matching current detection; this proof does not
   reinterpret manual corrections or change detector/verification rules.
5. Resolve the owner-prefixed canonical private Storage path from the DB. Download
   through Supabase's authenticated `report-photos` object endpoint with service
   credentials, never a caller URL or a returned signed URL. Disable redirects,
   bound response sizes (JPEG <=5 MiB; JSON <=256 KiB), require JPEG MIME/magic,
   decode <=4 MP with jpeg-js's 96 MB decoder guard, and verify registered SHA-256
   and dimensions against actual bytes. No external ML/inference provider is used.
6. Reuse `paddedCrop` and `prepareCrop` from `lib/death-policy.ts`: 15% expanded,
   clamped crop, Pillow-style bilinear aspect resize, centered RGB (124,116,104)
   padding, float32 RGB `[1,224,224,3]`. Normalization/sigmoid remain in the graph.
   Lazily checksum/load/self-test one CPU ONNX session, with one intra/inter-op
   thread. Initialization failures can retry. Each request scores one insect.
7. Before persisting, re-read report/path/owner, box/revision, detector timestamp
   and acceptance eligibility. Call only M1 `record_trusted_model_prediction`.
   Its locked revision and registered-image checks provide the final DB guard.
   Return only safe prediction metadata and a raw, uncalibrated dead score.

There is no ALIVE/DEAD assignment or new cutoff in this proof. The output is a raw
observation with `predictedLifeStatus: null`, not an inferred accepted life status.
The existing live 0.98 policy is unchanged. No model was retrained or replaced.

## Provenance, shadow isolation and idempotency

The unchanged M1 RPC records model SHA/version, preprocessing version, insect box
revision (FK to immutable geometry), source image SHA, server inference timestamp,
recording timestamp, runtime/version, recorder, and forced `server_trusted`
provenance. The deterministic private key includes these source/version identities,
normalized box coordinates and detector epoch; the RPC adds its `server:` prefix.
Clients cannot choose this key or write a trusted row.

Every API response explicitly carries `shadowOnly: true`. M1 predictions have no
`shadow_only` column; persisted proof rows are marked by runtime
`vercel-node-shadow-only-v1` and a null predicted label. No competing schema or
migration was introduced. The endpoint never calls transition/credit/legacy
classification RPCs. M1's live flag is constrained false. Its matching-label
requirement rejects these null-label predictions as automatic acceptance evidence,
even with an approved test policy. That rejection was exercised against PostgreSQL.
Prediction persistence alone changes no verification state or credit balance.

Authorized identical replays return the stored UUID/score/timestamp. Concurrent
requests in one instance coalesce. Different instances may duplicate computation,
but M1's unique immutable key chooses one row; a losing timestamp-different RPC
attempt retrieves and validates that winner. No evidence is overwritten. One
instance serializes inference with at most two pending unique jobs; excess receives
429. This is a per-instance bound, not a distributed quota or global rate limiter.

## Executed tests and numerical results

- Root `npm test`: **89 passed**, including 19 new proof boundary/service tests.
- Native Node 22.16.0 model tests passed: actual loading/session reuse, checksum
  and self-test failures, initialization retry, invalid JPEG/dimension handling.
- Packaged macOS Node 22 handler + real disposable PostgreSQL/M1 RPC integration
  passed. Auth and private Storage were **stubbed**; actual SQL and native inference
  ran. Unauthorized and cross-user calls never downloaded images. Four concurrent
  identical requests shared one download/prediction; two independent handler
  instances reconciled one immutable DB winner. Stale revisions failed. Complete
  snapshots of reports, insects, votes, live credits, shadow verification states,
  decisions, credit accounts and events remained unchanged.
- Four real crop cases (full and interior crops on two real JPEGs) matched the
  original preserved PyTorch model on identical prepared tensors with maximum
  absolute error **4.172325134277344e-7**.
- Actual Chromium production-worker scores matched native scores with maximum
  absolute error **3.5762786865234375e-7**. No legacy 0.98 decision mismatches.
  These fixtures establish compatibility, not calibration/accuracy or arbitrary
  near-threshold equivalence. No new threshold decision is made by the proof.
- Both full-image native scores exactly matched M1 native measurements.
- `npm run typecheck`, `npm run build:web`, and **9 Playwright tests passed**,
  including app shell/phone-startup budgets and local-only browser asset behavior.
  The exported app contains no proof endpoint/native-runtime imports.
- Isolated npm installation/audit reports zero known advisories after pinning the
  installer-only `adm-zip` override to 0.6.1. ONNX Runtime stays at 1.24.3. ZIP,
  proxy/download installers, dev tools and unrelated-platform binaries are excluded
  from the function package.

Machine-readable evidence: [local endpoint performance](milestone-2a-local-results.json),
[native crop references](milestone-2a-native-parity.json),
[original PyTorch comparison](milestone-2a-pytorch-parity.json),
[actual browser comparison](milestone-2a-browser-parity.json), and
[Linux package inspection](milestone-2a-package.json).

The original checkpoint SHA remains
`99c557bad5862504641bd09284ef1ec3b50fb885ca1b5f40ea13a2cc0994bd85`.
The model SHA remains
`57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`.

## Performance and runtime limits

Recorded local measurements use macOS arm64, Node 22.16.0, native ORT 1.24.3.
The final first uncached inference request took 186 ms; 12 subsequent uncached
requests had median 102 ms and p95 119 ms. A 1600×1600 synthetic JPEG crop request
took 218 ms. An earlier fresh-process run took 984 ms for the first request;
filesystem/native library caching materially affects these local measurements.
A replay avoids native inference. Local request timing includes subprocess-based
PostgreSQL REST stubs, not real Auth/Storage network latency. This is not a Vercel
cold start. The final harness peak RSS was approximately 291 MiB and includes stress-image
construction and multiple handler instances, not a clean function working set.

The function uses a 20-second cooperative deadline and advertises 30-second maximum
hosted duration. Fetches receive an AbortSignal, queued jobs check deadlines, and
no timed-out native result is persisted. JPEG decoding/native work is synchronous
or non-cancellable while executing; the soft deadline is not preemptive cancellation.
Actual hosted memory/duration/account limits have not been exercised.

The inspected Linux x64 function directory is **40,235,871 bytes** (~38.4 MiB),
including the 4,142,697-byte model and only two Linux CPU ELF binaries (35,548,416
bytes). It uses Vercel's [Node Build Output format](https://vercel.com/docs/build-output-api/primitives),
`nodejs22.x`, Nodejs launcher, `x86_64`, no request helpers, and a filesystem route
plus 404 fallback. Private files stay under the function mount; no static output
or model route is generated. This is directory size/inspection, not an uploaded
Vercel bundle or successful dynamic linking on Linux.

## Security findings and remaining limits

No unsafe client-controlled execution, inference URL fetching, SQL interpolation
in the endpoint, credentials in responses/logs, signed image URLs, model download
route, or verification/credit writes were found in the isolated implementation.
Production modules do not spawn processes. PostgreSQL subprocesses exist only in
the disposable test harness, which is not bundled. Errors are sanitized and all
responses are `no-store`; browser cross-origin access is not enabled.

The service key necessarily has broad existing Supabase privileges: keep it in
server-only Preview environment settings and restrict preview access. Auth tests
prove the implemented checks against stub responses; they do not prove the actual
hosted project's JWT/Auth configuration or storage settings. Those require real
owner/admin/cross-user/expired-token validation after approval.

M1's final transaction atomically guards revision/image identity; report rejection,
admin-role changes and detector epoch are checked before persistence, not locked
in the same M1 RPC transaction. A last-moment change can leave an inert shadow
observation, never acceptance or credit. No live consumer may be added without
revisiting that boundary. Replay trusts the registered immutable source identity;
it does not re-download a previously scored object. New inference always checks
actual bytes. Do not overwrite registered private objects outside existing rules.

The existing frontend intentionally already serves the browser ONNX model. M2A
adds no new artifact exposure and does not claim that the pre-existing browser
artifact becomes confidential. Hiding that existing asset would change current
production behavior and was outside this isolated proof.

## Hosted validation prerequisites — approval required

1. Review remote migration history and actual schema/permissions. M1 must be
   present in a controlled test database with registered model/photo identities.
   No migration was applied remotely here. **Do not bulk-push draft migrations
   16/17/18**; reconcile the older unapplied drafts separately before approval.
2. Approve a Preview-only endpoint on the existing Vercel project, with test
   reports/accounts and authenticated private Storage. Review project Node22,
   x86_64, region, memory/duration and plan/quota settings. No new provider is needed.
3. Reproduce the Linux build from the isolated lockfile, inspect its private files,
   and link only the external temporary build directory to the existing project.
   An approved prebuilt Preview can use its `.vercel/output`; do not replace root
   Expo config or deploy the macOS local-test artifact. No deploy command was run.
4. Set the three server-only Supabase settings, explicit allowed UUIDs and enable
   flag only for that Preview; apply existing deployment protection where available.
   Never use public/frontend-prefixed secret variables. Production remains blocked.
5. Validate real hosted session authentication, owner/admin/cross-user access,
   private Storage retrieval, model linking/self-test and persisted provenance.
   Run expired-token, missing/deleted image, stale box, repeated/concurrent request,
   maximum-size image, timeout and 429 cases. Confirm one row per identical key,
   null label, shadow runtime marker and unchanged live verification/credits.
6. Measure actual hosted cold/warm latency, memory, concurrency, transfer, function
   bundle and limits. Stop/disable the Preview on failure. Those measurements are
   the required hosted proof; the current local measurements do not replace them.

## Files created in M2A

No pre-existing tracked application, migration, root manifest or deployment config
was edited by this milestone. All M2A code/doc/test files are new:

- `proofs/trusted-inference/package.json`, `package-lock.json`: isolated pinned
  native runtime/JPEG deps, build dev dependency and patched installer override.
- `proofs/trusted-inference/{entry,handler,service,store,runtime,errors}.mjs`:
  isolated authenticated inference implementation.
- `proofs/trusted-inference/build.mjs`: private, pruned external Build Output.
- `proofs/trusted-inference/{test-fixture,test-runtime,test-packaged}.mjs`: explicit
  test doubles, actual model checks, packaged-handler/real-PostgreSQL integration.
- `proofs/trusted-inference/.env.example`, `README.md`: server-only setup and
  reproduction instructions.
- `tests/trusted-inference-poc.test.mjs`: authorization/security/error/retry tests.
- `tests/browser/trusted-inference-proof.spec.ts`: actual browser/native parity.
- `docs/milestone-2a-{local-results,native-parity,pytorch-parity,browser-parity,package}.json`:
  measured test artifacts.
- `docs/MILESTONE_2A_TRUSTED_INFERENCE.md`: this handoff.

Generated `node_modules`, web exports, browser reports, prepared tensor files,
local function packages and disposable PostgreSQL data are not deliverable source.
Work stops at this proof. No next milestone, live credits, auto-verification,
production deployment or hosted database change has been started.
