# Model implementation checkpoint

Date: November 8, 2026
Branch: `model-implementation`

## Current state

The branch contains an experimental alive/dead classifier, its local training and
checkpoint pipeline, native app integration gated by Roboflow detections, and
community verification labels. It is **not a validated automatic death-verification
system**. Automatic acceptance and points remain disabled.

The latest product constraint is free distribution outside the App Store.
The implemented inference path still requires a custom native app build; Expo Go
and the website support detection and community review but do not execute the
classifier. Browser inference and hosted server inference have been discussed as
alternatives, but neither is implemented. The deployment choice remains open.

## Implemented behavior

1. The app saves the report and resized JPEG in Supabase.
2. The existing `identify-report` Edge Function calls Roboflow and saves qualifying
   lanternfly boxes. A failed, empty, or processing detection result does not run
   the alive/dead classifier.
3. A custom native build downloads the saved photo and scores each detected insect
   locally with the bundled ONNX model. There is one score per box, not one label
   for a potentially mixed-insect photo.
4. Supabase records the model checksum, detector snapshot, per-box scores,
   registered threshold, failure status, and a shadow proposed-dead decision.
   The server checks ownership, current gate, score count/range, and model
   registration. Client-supplied scores cannot verify a report.
5. All public detected reports currently remain eligible for community review,
   including scores above the cutoff. Private reports stay private.

The native runtime checks its availability **before importing ONNX**, preventing
Expo Go's `Cannot read property 'install' of null` module-initialization failure.
It verifies the model checksum and a reference prediction before scoring. Missing
native support is stored as unavailable; community review stays usable.
The guard is regression-tested but a successful post-fix physical-device run has
not been confirmed in this checkpoint.

The Community screen has a separate oldest-first queue of up to 25 reports needing
the current viewer's labels. Members can assign/change/remove alive, dead, or
uncertain labels per numbered detection. Self-voting is blocked. Social reactions
remain separate. Other members' votes and machine scores are hidden from reviewers.

## Model and threshold

- Architecture: frozen ImageNet MobileNetV3-Small encoder plus a regularized linear
  classifier; training is local CPU feature extraction/head fitting, not backbone
  fine-tuning or training from scratch.
- Reviewed training crops used: 83 (30 alive, 53 dead), from 91 audited photos.
  Four multi-detection and four no-detection images were not used in that fit.
- Model version: `lanternfly-dead-v1`.
- Bundled weights: `assets/models/lanternfly-dead.onnx`, approximately 4 MB.
- SHA256: `57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`.
- Input: float32 RGB NHWC `[1,224,224,3]`, pixel values 0–255; normalization and
  sigmoid are embedded. Crops have 15% padding and centered square padding.
- Output: continuous **uncalibrated dead score**, not a proven probability.
- Provisional routing cutoff: **0.98**, from `assets/models/policy.json` and the
  server model registry. The `0.70` in model metadata/training metrics is the
  original experimental baseline, not the current proposed routing cutoff.

Three-fold grouped out-of-fold scores at 0.70 accepted 46 images, including four
live insects. Selecting 0.98 using those same scores accepted 21/53 dead images
and 0/30 live images, leaving 62/83 for review. These are threshold-selection
results, not independent validation of the final all-data model. The app's shadow
mode still sends even those 21 high-score cases to community review.

The target is at most 1% of **live insects** falsely accepted as dead. Under
independent representative sampling, zero errors on 299 live insects would put
the one-sided 95% upper bound below 1%. Dead examples are also required to measure
coverage. A separate new-insect batch exists according to the user but is currently
inaccessible. Neither that target nor calibrated death probabilities are established.
Unknown specimen/session overlap remains an evaluation limitation.

## Training recovery and feedback

`ml/confidence.py` saves extracted features, completed validation folds, and final
weights under `confidence-training/_work/checkpoints/`. Atomic writes preserve the
previous complete artifact if interrupted. Rerunning training resumes matching
checkpoints; cache keys account for crop bytes, versions, labels/groups, and
evaluation settings. There are no training epochs or optimizer states in this
frozen-encoder baseline.

Private photos, crops, caches, Python environments, evaluation outputs, generated
SQL Editor script, native project backups, and training checkpoints are ignored
by Git. **Pushing this branch does not back those files up.** Only code,
synthetic fixtures, and the deployable model bundle are included.

Admin-only views expose vote-based candidates and human-reviewed examples.
Reviewed examples require a specimen group, dataset split, reviewer, and label.
A trigger blocks known groups from crossing train/calibration/test splits.
Votes never automatically become training labels, trigger retraining, or overwrite
phone weights. Photo export, curation, retraining, evaluation, and release are
explicit administrator steps. Current-private reports are excluded from export
views; visibility changes must also be honored in downloaded dataset snapshots.

## Database and deployment status

Migration: `supabase/migrations/20261107000000_death_assessments.sql`.
It adds model registration, shadow assessments, biological votes, review queues,
and admin training-review tables/views/RPCs with access controls.

The user reports applying the transaction-wrapped script through the shared
LanternDie project's SQL Editor and receiving:

```text
20261107000000 | death_assessments
```

That script includes the migration-history entry. Remote schema state was not
independently queried afterward. Do not blindly reapply the migration.
CLI deployment was blocked first by temporary-login-role authentication and then
by a rejected direct database password. No shared database password was reset.
The existing Roboflow Edge Function did not require changes for this increment.

The project is upgraded to Expo SDK 58 (`expo` 58.0.23 at verification), React
19.3.0, and React Native 0.88.1 to match current iPhone Expo Go. The generated SDK
57 iOS project was preserved under ignored `_work/native-backups/` before SDK 58
prebuild regenerated it. Native generated directories are not committed.

No successful native compilation, signed app installation, TestFlight/App Store
submission, or production release of this branch is confirmed. The user's Expo Go
logs confirm iOS bundling, but Expo Go cannot execute the custom model.

## Validation at this checkpoint

- `npm run typecheck`: passed.
- `npm test`: 25 tests passed, including missing-native-module guards,
  Pillow-compatible synthetic preprocessing, model checksum/registry consistency,
  and detector parsing.
- Python training/threshold suite: 12 tests passed, including checkpoint recovery,
  interrupted writes, grouped evaluation, independent-set checks, and error bounds.
- Web production export: passed after SDK 58 upgrade.
- iOS JavaScript/asset export: passed after SDK 58 upgrade and native guard fix.
- Android JavaScript/asset export: passed before SDK 58 upgrade; not revalidated
  on SDK 58 in this checkpoint.
- ONNX vs. PyTorch: 85 inputs (83 real crops plus black/white inputs) checked;
  max absolute score difference about 0.00000221. Also checked using Python ONNX
  Runtime 1.24.3, matching the React Native runtime package version.
- Local disposable PostgreSQL tests: passed for gate enforcement, owner-only
  results, immutable completed snapshots, vote changes/removal, privacy,
  review queue behavior, admin exports, and specimen split isolation. CI runs
  the new access-control test alongside the existing identification-access test.
- Expo dependency alignment check: passed. Expo Doctor: 19/20 checks passed;
  local CocoaPods tooling failed its check. Native compilation/device inference,
  latency, and memory remain unverified.

## Next steps

1. Decide the inference delivery path for free distribution: browser inference
   in the mobile website, or hosted inference callable by the website/Expo Go.
   Server hosting/inference and Roboflow may incur usage costs; no unlimited free
   service is assumed. The currently implemented native path remains available
   for local development if desired.
2. Exercise the full report/detection/classification/storage/review flow on the
   chosen runtime. Fix CocoaPods/platform tooling if continuing with native builds.
   Test two accounts, private/public changes, multiple insects, retries, and restarts.
3. Improve owner-facing classification wording: the current UI shows the dead
   score and above/below-cutoff status, not explicit alive/dead labels. Below 0.98
   means uncertain; no validated alive cutoff exists.
4. Collect/retrieve the untouched batch, freeze the model/cutoff, and run
   `ml/threshold.py validate` before enabling automatic acceptance. Validate actual
   app JPEG/crop preprocessing, not just synthetic resizing. Training intermediate
   crops are JPEG quality 95 while the phone crops decoded uploaded pixels directly.
5. Curate community candidates, preserve independent test groups, retrain a
   versioned candidate with checkpoints, validate it, register the new checksum,
   and release it with a rollback path. Automated weight updates are not implemented.

See `ml/README.md` for local training/threshold commands and `ml/INTEGRATION.md`
for architecture and rollout details.
