# Local alive/dead experiment

All photos, detector caches, crops, models, predictions, and the Python environment
stay under the ignored `confidence-training/` directory. Only code and these
instructions belong in Git. This does not deploy classification or change the
app's acceptance behavior.

Use Python 3.12 and run commands from the repository root:

```sh
python3.12 -m venv confidence-training/.venv
confidence-training/.venv/bin/python -m pip install -r ml/requirements.txt
confidence-training/.venv/bin/python ml/confidence.py audit
```

`audit` reads `alive/` and `dead/` locally, checks that images decode, respects EXIF
orientation, and detects exact pixel duplicates (even with different filenames).
Conflicting labels and unreadable images must be resolved before cropping. It
does not detect all near-duplicates, paired insects, or similar backgrounds.

## 1. Prepare detector crops

```sh
confidence-training/.venv/bin/python ml/confidence.py crop
```

**This command sends each uncached photo to the configured Roboflow workflow and
uses inference credits.** It reads the same server-only
`supabase/functions/.env` configuration as identification. Photos are oriented,
resized to at most 1600 pixels, and JPEG-encoded before inference. Requests use
header authentication; secrets are never stored in cache files or printed.

Each photo with exactly one qualifying detection gets a crop with 15% padding
on each side. Zero/multiple detections and failed requests are listed for review
in `_work/manifest.csv`; these photos are not silently treated as alive or used
for training. Cached detections avoid repeated API requests on reruns. The cache
key includes image pixels, workflow identifiers, prompt classes, and threshold.
It does not detect server-side edits to a workflow with the same ID; use a new
data/work directory if intentionally refreshing all detections.

## 2. Review crops

Open `confidence-training/_work/review.html` in your browser. Check that each crop
shows the labeled insect with the relevant body parts. Compare with the original
photo when necessary. In `_work/manifest.csv`, change a bad crop's `status` from
`ready` to `excluded`. Review no-detection and multiple-detection images against
the originals too; excluding them creates selection bias, so report detector
coverage separately for alive/dead photos.

For `multiple_detections_review`, the review page shows numbered candidate crops.
Choose the box that includes the complete insect with the correct label, enter
its number in the row's `selection` column, save the CSV, and rerun `crop`.
Cached detections are reused. Overlapping boxes can be predictions of the same
insect. If none is a correct crop, set `status` to `excluded`.

`no_detection` means no qualifying lanternfly box was returned. The general
workflow sometimes returns null dimensions with zero predictions; the script
uses the known input dimensions for that valid empty result. You can exclude
the photo, or manually crop/zoom a copy and run detection on it again. Preserve
the original and exclude its row if adding a replacement, so it is not counted
twice. `failed_ValueError` now has an `error_detail` explaining what validation
failed; do not change it to `ready` unless a real, reviewed crop file exists.

The `group` column starts with an exact pixel hash. If you recognize a paired
insect or a collection session, assign those rows the same group value. Known
groups and exact duplicates stay together in every cross-validation fold. Group
edits and excluded rows are preserved on reruns if the original pixels match.
Unknown pre/post pairs remain a limitation; grouping by exact pixels cannot
identify them automatically. This is still independent-image inference: groups
only control evaluation splits, not inputs the model needs at runtime.

## Adult-only improvement workflow

The beta awards credit through human verification. Offline model improvement
focuses on **adult spotted lanternflies**; it does not narrow the existing human
review workflow to adults. Keep `confidence-training/eval/` separate from fitting.
The current 14-image batch is now a diagnostic set, not untouched evidence for
selecting an improved model. No new weights or cutoff are deployed by this change.

Cropping now preserves a `life_stage` column in `_work/manifest.csv`, initially
`unknown`. Review the actual crop and set `life_stage=adult` only when supported;
use `nymph` or `unknown` for other cases. Do not rely solely on Roboflow's stage
label: the evaluation batch includes apparent adults labeled as nymphs. Existing
manifests can have this column added manually without rerunning remote inference.
Keep `status=excluded` for unsuitable crops and set shared specimen/session groups.

Run the adult-only experiment after reviewing stage labels:

```sh
confidence-training/.venv/bin/python ml/confidence.py train --reviewed-crops --adults-only
```

This includes only ready rows explicitly marked adult. Missing/unknown stages
are excluded; no eligible rows causes an actionable error. Checkpoints and metrics
record the stage scope, and ONNX export uses that scope for its reference examples.
Prefer a separate experiment data directory via `--data` when preserving candidate
models; a new run in the same directory replaces its local final artifact, but
does not replace `assets/models/` or change production approval behavior.

Priorities are complete crops and varied real adult examples (intact dead adults,
open-wing living adults, different backgrounds and limb positions). Try modest
label-preserving augmentation and a small hyperparameter comparison after splitting
by insect/session; keep all derivatives in the original training split. Never
augment validation/test data or count augmentations as independent insects. Network
fine-tuning and automatic approval remain later experiments.

## 3. Fit the lightweight baseline

After reviewing the crops:

```sh
confidence-training/.venv/bin/python ml/confidence.py train --reviewed-crops
```

The first training run downloads the public pretrained MobileNetV3-Small weights.
Training and feature extraction happen locally on CPU. The script freezes the
feature extractor, removes the original ImageNet classification head, and fits
an L2-regularized logistic classifier. It pads crops to 224×224 to preserve the
whole insect and applies ImageNet normalization. There is no training from
scratch, background image uploading for training, or fine-tuning of the backbone.

Three-fold stratified grouped cross-validation produces one held-out score per
image. Feature scaling and classifier fitting use only each fold's training rows;
the frozen ImageNet backbone is never fitted on your photos. Hyperparameters and
the 0.70 experimental threshold are fixed. No calibration model is fitted to this
tiny dataset. Unknown insect pairs/session overlap mean results are preliminary.

Generated files under `_work/model/`:

- `out_of_fold.csv`: image labels, groups, folds, raw dead scores, and decisions.
- `metrics.json`: acceptance rate, accepted precision, and live-insect mistakes.
- `classifier.pt`: frozen feature extractor plus a single linear output, with
  preprocessing metadata and `calibrated: false`.

The exported head is verified against sklearn predictions before saving. The
final artifact is fitted on all reviewed crops; its training predictions are
not reported as evaluation performance. These scores are not established
probabilities: 0.70 is an experimental cutoff, not a proven 70% chance of death.
Keep the app's alive/dead status unassessed until a separate batch of new insects
supports calibration and acceptance validation. Dead photos showing only squish
damage also cannot establish performance on intact dead insects.

For on-phone deployment, use the ONNX export described below and integrate a
native inference runtime. Add calibration using an independent representative
set and test the whole detection/crop/classification pipeline. Raw scores are
stored as owner-visible shadow observations in Supabase, not verification decisions.

## Resuming interrupted training

Every extracted image feature is saved under `_work/checkpoints/features/`.
Each completed validation fold and a copy of the final weights are saved under
`_work/checkpoints/runs/<fingerprint>/`. Checkpoints and final weights use atomic
writes: an interruption while writing does not overwrite the previous complete
file. Rerun the same `train --reviewed-crops` command to resume automatically.
Only unfinished feature batches/folds are repeated. The final logistic head is
quickly refitted; this frozen-backbone baseline has no epochs or optimizer state.

Crop bytes, preprocessing, encoder and package versions determine feature cache
keys. Features, labels, groups, fold count, sklearn version, and classifier settings
determine evaluation cache keys, so changing those inputs starts a new run.
Keep the entire ignored `_work/` directory to preserve local progress. These are
local recovery files, not off-device backups or files included in Git.

## Export weights for on-phone inference

The phone classifier can run without an inference server. Install export tools
and export after training:

```sh
confidence-training/.venv/bin/python -m pip install -r ml/requirements-mobile.txt
confidence-training/.venv/bin/python ml/export_mobile.py
```

The exporter creates `_work/mobile/lanternfly-dead.onnx`, a self-contained ONNX
model with weights and normalization embedded. It checks the ONNX graph and
compares ONNX Runtime outputs with PyTorch on every ready crop plus all-black
and all-white inputs (absolute and relative tolerance `1e-5`) before publishing
the model. This validates export fidelity, not predictive accuracy or device
performance. No images are uploaded by training or export.

Ship the model with `_work/mobile/model.json`, which records the exact input
contract, checksum, crop recipe, and verification results. The model accepts
packed RGB **float32 NHWC `[1,224,224,3]` in the range 0–255**, already cropped, resized with bilinear
interpolation preserving aspect ratio, and centered on padding RGB `(124,116,104)`.
Match `PIL.ImageOps.pad` rounding. Do not supply RGBA, BGR, or values normalized to 0–1.
It returns `[1,1]` containing a sigmoid dead score. Normalization and sigmoid are
already part of the graph. Below 0.70 currently means uncertain, not proven alive.

For native integration, bundle the `.onnx` asset and use
[ONNX Runtime React Native](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html).
Its [Expo instructions](https://github.com/microsoft/onnxruntime/blob/main/js/react_native/README.md)
require the native module/config plugin and a native development or production
build; the stock Expo Go app cannot load this additional native runtime.
Run `reference.f32` through a float32 tensor with the documented shape and compare
the result against `reference.json` on each supported phone. The reference is a
real dataset crop; keep it with local QA artifacts rather than shipping it to users.
Measure latency and memory on actual devices before choosing acceleration or
quantization. CPU parity here does not establish parity on phone accelerators.

This artifact classifies a single lanternfly crop. The native app loads it after
remote Roboflow identification succeeds, once per detected box. A fully offline
flow would also need an on-device detector or a user-selected crop.
Independent-insect validation and calibrated acceptance remain separate work.

Run local pipeline tests with:

```sh
confidence-training/.venv/bin/python -m unittest discover -s tests -p 'test_confidence*.py'
```

## Select and independently validate a routing threshold

The requested target is **at most 1% of live insects incorrectly accepted as
dead**. This is a false-accept rate among live insects, not the fraction of
accepted posts that are wrong. It is also different from probability calibration:
changing a cutoff does not turn raw scores into death probabilities.

```sh
confidence-training/.venv/bin/python ml/threshold.py analyze --max-live-error 0.01
```

This explores a fixed 0.70–1.00 grid in increments of 0.01 using saved out-of-fold
scores. It chooses the lowest cutoff meeting the **observed** live-error target
while accepting at least one dead insect. `_work/threshold/analysis.json` records
every candidate. `_work/threshold/policy.json` freezes the provisional cutoff,
target, and exported ONNX model checksum. Files are written atomically, and
training checkpoints are unchanged. The exported model's own 0.70 metadata is the
original baseline only; the threshold policy is a separate, model-bound proposal.
Automatic verification stays disabled. These selection scores were generated
by fold models; they are not independent validation of the all-data phone model.
No model or calibration layer is refitted by this command.

When the new batch is available, make a CSV with `path,label,group` columns.
Paths are relative to the CSV; labels must be `alive` or `dead`. Each image must
be a reviewed insect crop prepared with the training crop recipe. Choose **one
photo per independently sampled insect** and use its specimen ID as `group`.
Use new insects and collection sessions, not different photos of training insects.
Include intact dead insects and realistic live poses/backgrounds. Do not select
the batch based on model scores. For example:

```csv
path,label,group
crops/live-001.jpg,alive,new-specimen-001
crops/dead-001.jpg,dead,new-specimen-002
```

Evaluate the frozen cutoff on this untouched batch:

```sh
confidence-training/.venv/bin/python ml/threshold.py validate \
  --manifest /path/to/new-batch.csv --independent-specimens
```

The command scores the new crops with the exported ONNX model, checks its
checksum, rejects exact pixel/preprocessed duplicates and known training groups,
and computes an exact **one-sided 95% upper confidence bound** on the live-error
rate. Group/session independence and near-duplicates still require human review.
It needs both classes and some dead-insect coverage to report the target supported.
Content-addressed reports under `_work/threshold/validations/` preserve past
evaluations. A passing result does not edit app behavior or enable automation.
Do not adjust the cutoff after inspecting the validation results and reuse the
same batch as evidence: a revised cutoff needs another untouched test batch.

With zero observed false accepts, **299 independent live insects** are needed
for that upper bound to fall below 1%, assuming representative independent sampling.
Dead examples are also needed to measure useful automatic coverage; the current
dataset cannot establish the requested target. A score below the eventual cutoff,
invalid inference, or a missing/ambiguous crop should go to community verification.
This script evaluates reviewed crops; it does not yet validate detector failures
or the entire app upload and routing pipeline.

Statistical reference: [SciPy exact binomial confidence intervals](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binomtest.html).
For probability calibration, use data disjoint from model fitting as described
in the [scikit-learn calibration guide](https://scikit-learn.org/stable/modules/calibration.html).
