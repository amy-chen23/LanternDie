# Approved application release — November 14, 2026

The user authorized merging the current application into main and pushing it to
trigger the existing Vercel Git deployment. This approval does not apply database
migrations, deploy Supabase functions or enable hosted shadow inference.

The release includes the merged main UI, browser-local classifier, inline Explore
review, classification/credit presentation, publication celebration, local runtime
asset build, regression tests and supporting documentation. CI adds Chromium browser
tests to the existing app checks; its existing database suites remain unchanged.

Excluded work remains in the original local checkout: M1 verification service/state
and draft migration 18; M2A proof source and feasibility/database harnesses; unused
Python service and draft migration 16; superseded feed policy/migration 17; and
unfinished worker/environment/scheduler changes. Historical milestone documents
are retained as context, not as a claim that their implementation ships in this
application commit. No root API or migration-on-build is introduced.

`RELEASE_VALIDATION.md` and `release-validation.json` record the preceding full
development-workspace audit. Release-selection checks are recorded below separately.
Known feed-policy, avatar-policy, physical-device and hosted inference limitations
remain as documented there. Existing one-credit-per-confirmed-DEAD rules are unchanged.

Secrets, local training data/checkpoint, dependencies and generated inference/export
assets stay ignored. The already tracked ONNX source is packaged by the build.

The exact Git-index snapshot passed a clean Node22 install, **84 application unit
tests**, typecheck, production web export, **62 production-browser tests** across
the four configurations (zero skipped/flaky), and the **10 unchanged database CI
suites** on disposable local PostgreSQL18. The lower unit/SQL counts compared with
the full-workspace audit exclude the unshipped shadow/prototype suites. Hosted CI
will independently run PostgreSQL17 after the push. Original model hashes remain
unchanged. No application source changed between that snapshot and this commit;
this release-scope note records the final selection results.

The existing delivery path is source repository main → its public-mirror workflow
→ `amy-chen23/LanternDie` main → the existing Vercel project. Do not create a new
project or bypass that workflow. Deployment status must be checked on the mirrored
commit, since the source repository does not receive the Vercel status itself.
