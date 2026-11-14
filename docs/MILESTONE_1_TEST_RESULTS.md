# Milestone 1 test results

Executed locally November 13, 2026. No hosted migration, inference deployment,
production account workflow or remote data mutation was performed.

## Passed checks

- `npm run typecheck` — passed.
- `npm test` — **70 passed**, including five new verification foundation tests.
- `npx --yes deno check lib/verification-state.ts lib/verification-service.ts` — passed.
- `npm run build:web` — passed; current browser worker/model assets still export.
- `npm run test:browser` — **8 passed**, including actual WASM predictions, invalid
  files/dimensions, missing/corrupt model/runtime assets, session reuse, production
  sign-in startup and CPU/network-throttled phone-size startup.
- `python -m unittest discover -s tests -p 'test_confidence*.py'` — **13 passed**.
- `python -m unittest discover -s tests -p 'test_model_service.py'` — **1 passed**
  using the existing unused prototype in-process; no server listener was started.
- `node scripts/test-verification-compatibility.mjs` — **11 SQL suites passed**:
  admin attention, admin moderation, admin role access, automatic-pipeline prototype,
  community feed, community review, death assessment, identification, report overhaul,
  report processing, and new verification foundations.
- `node scripts/test-verification-concurrency.mjs` — **passed**: four concurrent
  credit retries return one event/ID; two concurrent decision attempts produce one
  commit and one stale-version rejection. It creates/stops/removes its own local
  cluster, without using hosted or existing database credentials.
- Node ORT 1.24.3 probes on Node **22.16.0** and **24.14.1** — passed real graph
  self-test, two JPEG reference decisions, and a 20-crop image stress workload.
- Generic Deno **2.9.6** single-threaded WASM graph/image probe — passed locally.
- Original PyTorch weights versus identical Node-prepared tensors — **2 passed**,
  max absolute error **2.0023435354232788e-08**, zero legacy decision mismatches.
- Original checkpoint and registered ONNX SHA-256 checks — unchanged.
- `git diff --check` — passed.

The compatibility runner adds the foundation to nine full-schema suites. Two
intentionally minimal historical fixtures (identification/death assessment) run
unchanged: they omit required report-foundation tables/functions. The first
runner attempt incorrectly injected into those fixtures and failed on missing
`private.is_report_admin`; the runner was corrected, then all eleven suites passed.
This was a test-harness issue, not a deployed migration failure.

## Milestone requirements covered by assertions

1. Exact pre/post report, box/label, vote and legacy audit equality across migration.
2. Exact historical credit equality, including a report with two confirmed DEAD
   insects retaining two credits; no legacy accounts copied into the new ledger.
3. Owner browser RPC forces untrusted provenance; browser callers cannot invoke
   the trusted RPC or credit RPC. Other reviewers cannot read private predictions.
4. Predictions require registered models/source hashes and current active box
   revisions; composite revision/report FKs reject invalid references. Corrections
   preserve old evidence and create a fresh PENDING shadow revision.
5. Illegal state jumps, stale decision versions and conflicting idempotency replay
   are rejected; TypeScript and SQL transition graphs are checked for agreement.
6. Repeated credit events and different-key duplicate grants cannot create extra
   credits. Actual concurrent calls are serialized and constrained uniquely.
7. Two insects in one report hold two independent shadow credit identities. Holding
   one leaves the sibling's provisional credit intact; overturned ALIVE reverses
   only its affected shadow credit. No report/device leaderboard cap is introduced.
8. Default seats=5, matching votes=3, review window=86,400 seconds.
9. Production seed auto-acceptance=false, live=false, confidence bands=NULL;
   new live flag cannot be flipped true in M1. Explicit approved numeric bands are
   TEST FIXTURES ONLY and never enable the live engine.
10. Existing duplicate, retry, voting, moderation, privacy and leaderboard suites
    continue passing. Browser feedback, popup and photo URL unit coverage also pass.

Additional checks cover immutable prediction/decision/credit/policy history,
private calibration references, window start at acceptance, early-finalization
rejection, expiry blocked by qualified report fraud holds, retained policy/evidence
on system finalization, absence of live credit side effects, and compatibility
with existing deletion paths.

## Environment and warnings

Local database: PostgreSQL 18. Cached hosted project version: PostgreSQL 17; no
hosted SQL was run. The SQL uses ordinary supported constraints/PLpgSQL, but hosted
migration verification remains a later explicit approval step.

Temporary Python environment: Python 3.14, PyTorch 2.15.0, ONNX Runtime 1.32.0;
Node/WASM inference probes use ONNX Runtime 1.24.3. Node dependencies were installed
outside the repository. The FastAPI prototype test therefore proves local behavior,
not the exact pinned prototype container image.

Non-failing warnings included Node's package/module-type/type-stripping notices,
Starlette's TestClient deprecation, and a local Python runtime telemetry device-ID
persistence warning. No failed numerical assertions or remaining failing tests
were observed in the completed checks.

## Not executed / not claimed

- Actual hosted Supabase Edge Runtime execution or an exact local Edge Runtime
  sandbox: local Docker/Edge Runtime was unavailable.
- Linux/Vercel function packaging/deployment, cold starts or production billing.
- Remote migration history verification or hosted migration application.
- New live automatic acceptance, live credit changes, formal contest processing,
  a deadline job, or authenticated production end-to-end scenarios.
- Independent-specimen calibration/accuracy validation or new production cutoffs.

## Local reproduction

Start a disposable PostgreSQL instance on loopback port 55439, then run:

```sh
node scripts/test-verification-compatibility.mjs
node scripts/test-verification-concurrency.mjs
```

The compatibility runner deliberately refuses normal/low ports; an explicit
`VERIFICATION_TEST_PORT` >=55000 can select another disposable local instance.
Its SQL fixtures roll back. The concurrency runner creates its own isolated
cluster and requires `initdb`, `pg_ctl`, and `psql` on PATH.

See TRUSTED_INFERENCE_FEASIBILITY.md for the inference probe and identical-input
comparison commands. Browser tests require the production export and Chromium.
