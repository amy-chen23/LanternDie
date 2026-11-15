# Milestone 1 handoff: shadow verification foundations

Implemented November 13, 2026. Nothing was deployed, committed, or enabled in the
live verification/credit path. Existing uncommitted changes were preserved.

## Delivered

The trusted-inference investigation and measurements are in
[TRUSTED_INFERENCE_FEASIBILITY.md](TRUSTED_INFERENCE_FEASIBILITY.md). Local Node
22.16.0 native ONNX inference is a viable candidate for the existing Vercel project;
actual Linux/Vercel packaging and authenticated execution remain approval-gated.
Generic Deno/WASM loads the model, but the image stress probe used about 349 MiB
process RSS, so Supabase Edge has insufficient demonstrated memory headroom.
A dedicated service is a fallback requiring explicit approval, not a deployment.

## Exact migration

`supabase/migrations/20261118000000_verification_foundations.sql` adds nine tables:

- `verification_engine_settings`: singleton live flag, false and constrained false.
- `verification_policies`: immutable versions; separate detection and asymmetric
  ALIVE/DEAD raw-score bands; calibration approval/reference; defaults of five
  seats, three matching votes, 86,400-second review window, auto-acceptance false.
  Every new detection/classification threshold is NULL in the seeded policy.
- `verification_insect_revisions`: immutable report/insect/box/revision snapshots.
- `insect_model_predictions`: append-only prediction, optional predicted life
  status, raw score, registered model/preprocessing versions, runtime, provenance,
  source image hash, inference/recording timestamps, recorder and idempotency key.
- `insect_verifications`: independent status, accepted life status, method, policy,
  optimistic decision version, provisional time, deadline, finalization time,
  hold reason and mandatory shadow-only marker.
- `verification_decisions`: append-only versioned transition/evidence history.
- `verification_contests`: report/insect scope, reason, author, optional private
  evidence path, qualification and resolution fields. Schema only; no contest API.
- `insect_credit_accounts`: one shadow one-unit identity per insect, not per report
  or device. Multiple insects in the same report retain independent identities.
- `insect_credit_events`: append-only transitions, source decision, idempotency,
  one-unit amount, balance delta, event version, timestamp and reason.

Constraints enforce valid states, accepted-label consistency, model registration,
revision/report relationships, ordered policy bands, deadline consistency, unique
versions and event keys. Partial unique indexes prevent duplicate open contests
for the same author/scope/reason. Supporting indexes cover prediction revisions
and qualified contests. Policies and event evidence cannot be updated/deleted.

All new tables have RLS and explicit privilege revocation, including service-role
DML. Service-role reads are allowed; writes require restricted RPCs. Authenticated
members can read non-private policy fields and verification snapshots for reports
already accessible through existing RLS. Predictions/decisions are owner/admin
only. Calibration evidence references, contest evidence and credit ledger rows
are not exposed to ordinary client SELECT operations. Contest submission and
resolution grants are deliberately absent.

Historical snapshots retain IDs without cascading FKs to legacy reports/insects,
matching the existing audit approach. Inserts validate current ownership and
geometry; prediction/decision FKs then reference immutable revision snapshots.
This preserves evidence without blocking existing report/account deletion.

## Centralized shadow service

`lib/verification-state.ts` defines the eight states and allowed transitions:
PENDING, AI_CLASSIFIED, PROVISIONAL, COMMUNITY_REVIEW, CONTESTED, VERIFIED,
INCONCLUSIVE, REJECTED. It also defines disabled/null defaults and a calibration
band evaluator. Unapproved bands cannot imply automatic acceptance. This is new
shadow code, not a replacement for the existing 0.98 feedback policy.

`lib/verification-service.ts` is an injected RPC adapter for future server code.
It is not imported by the current app or active workers.

New RPCs:

- `record_browser_model_observation`: authenticated owner only; always forces
  browser-untrusted provenance and cannot grant acceptance or credit.
- `record_trusted_model_prediction`: service-role only; registered model and photo
  hash, matching current active box revision, runtime/version and inference time.
- `transition_shadow_verification`: service-role only, valid transition checks,
  optimistic version locking and idempotent audit records. Automatic model
  acceptance requires trusted matching evidence and an explicitly approved policy.
  Model decisions cannot jump directly to VERIFIED. Future community evidence
  integration is explicitly rejected in M1.
- `record_shadow_credit_event`: service-role only; validates the current decision,
  accepted DEAD eligibility and legal credit transition. PROVISIONAL requires
  accepted trusted DEAD evidence. One insect has at most one active shadow unit.
  Repeated events return their prior ID; conflicting replay keys are rejected.

System finalization validates an expired provisional window, retained acceptance
policy/evidence, and absence of qualifying contests/other holds. Insect contests
scope the hold to that insect; report-wide duplicate/fraud contests block the
report's affected shadow acceptances. No deadline job, contest qualification
service, automated hold/release processor, or live ledger integration exists yet.

## Compatibility and migration safety

No already-applied migration was edited. This migration assumes the report
foundation and existing worker/review/moderation schema through `20261115000000`.
Tests also checked coexistence with the separate draft 16/17 branches.
The cached linked-project metadata identifies PostgreSQL 17; local tests used
PostgreSQL 18. No remote migration history or production schema was queried in M1.
Remote history must be checked before any approved future deployment.

Backfill writes only new revision/verification tables: existing final labels become
VERIFIED/legacy baseline snapshots with decision version zero. Existing reports,
boxes, votes, audit records and credit snapshots remain unchanged. There is no
historical credit backfill/recalculation in the new ledger.

A narrow after-insert/box-revision trigger captures future geometry and seeds a
new PENDING shadow revision. It never updates existing labels, live credits or
moderation. Legacy decisions continue through their original RPCs; ongoing legacy
label changes are not reinterpreted as new trusted shadow decisions in M1.

Every new decision/credit is constrained shadow-only. Existing leaderboard
functions, reconciliation triggers, voting, moderation, duplicate detection,
Roboflow, browser/native feedback and congratulations behavior remain active and
unchanged. The engine's live flag cannot be enabled without a future migration.

The earlier unapplied immediate-feed migration `20261117000000` is superseded by
the latest detection-first requirement. It was preserved, not deployed or edited.
Do NOT run a bulk hosted migration push containing draft 16/17/18. A later approved
rollout must reconcile those drafts explicitly. M1 adds no public inference route,
server secrets, production dependencies, schedules or frontend changes.

## Exact files created in M1

No pre-existing repository files were edited in this milestone.

- `supabase/migrations/20261118000000_verification_foundations.sql` — additive
  schema, constraints, RLS, provenance RPCs and centralized shadow transitions.
- `lib/verification-state.ts` — state graph, defaults and calibration interface.
- `lib/verification-service.ts` — restricted shadow RPC adapter.
- `tests/verification-foundations.test.mjs` — five unit/adapter/SQL-parity tests.
- `tests/verification-foundations-access.sql` — migration preservation, permission,
  provenance, geometry, transitions, windows, holds and credit invariants.
- `scripts/test-verification-compatibility.mjs` — executes existing access suites
  with the foundation injected where the full schema is available.
- `scripts/test-verification-concurrency.mjs` — isolated real-PostgreSQL races with
  its own temporary cluster and automatic cleanup.
- `scripts/feasibility/node-onnx.mjs` — local native Node graph/image benchmark.
- `scripts/feasibility/deno-wasm.mjs` — generic Deno graph/image compatibility probe.
- `ml/verify_trusted_tensors.py` — compares Node-prepared inputs to original PyTorch.
- `docs/trusted-inference-node-measurements.json` — supplemental Node 24 results.
- `docs/trusted-inference-node22-measurements.json` — project-version Node results.
- `docs/trusted-inference-deno-measurements.json` — generic Deno results.
- `docs/trusted-inference-tensor-parity.json` — identical-input PyTorch comparison.
- `docs/TRUSTED_INFERENCE_FEASIBILITY.md` — runtime/security/cost investigation.
- `docs/MILESTONE_1_TEST_RESULTS.md` — executed checks and limits.
- `docs/MILESTONE_1_VERIFICATION.md` — this handoff and implementation inventory.

Node native inference and extra Python test dependencies were installed only in
existing/new `/private/tmp` proof environments. Root package manifests, lockfile,
model artifacts, and production configuration were not edited by M1.

## Smallest safe next milestone — approval required

Build and validate a non-production Vercel Node inference function/package that
receives only authorized report IDs/revisions, retrieves private stored bytes,
computes unchanged-model outputs, and records trusted predictions in shadow mode.
Validate Linux native dependencies, actual bundled size, cold/warm memory/time,
concurrency, storage authorization, failure retries and replay protection.

Do not yet connect predictions to live acceptance or credit. Do not build the full
contest UI or deadline processor as part of that smaller step. Then approve the
calibration procedure and production ALIVE/DEAD bands before enabling automatic
acceptance. Feed detection-review policy and qualifying-contest rules still need
later implementation decisions. M2 was not started.
