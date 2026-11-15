# Classifier integration with the merged UI — November 14, 2026

Implemented locally on `report-overhaul` after integrating local main. Scope is
browser/custom-app inference; the user deferred Expo Go inference. No deployments,
migrations, new hosting, commits or pushes were performed.

## Current behavior

Owner uploads still enter the existing durable Roboflow detection workflow. When
accepted detections appear in the owner's Sightings cards, the unchanged local
classifier runs after a short render delay. Browser inference uses the existing
local ONNX/WASM worker assets. A custom native build uses the existing native
runtime adapter; Expo Go has no native bridge and shows an unavailable/community
review path without repeatedly attempting initialization.

Predictions are saved through the existing `save_death_assessment` RPC as untrusted
owner observations. The same image/crop preprocessing, model and **0.98** cutoff
remain. Results at/above cutoff show LIKELY DEAD; lower scores show UNCERTAIN.
Final community/admin decisions still override feedback as DEAD or ALIVE. No
prediction awards acceptance or credit; one confirmed DEAD insect remains one
credit under existing finalization rules. Roboflow, votes and credit SQL are unchanged.

## Integration fixes

- Report refresh after inference is quiet, so cards no longer unmount/restart work.
- The open results modal follows current report data instead of retaining its old
  object; cards and modal update together without reopening the modal.
- A cached observation must match detector snapshot, model SHA, existing threshold
  and a valid finite score per crop before suppressing inference/displaying feedback.
  Corrected boxes cannot inherit a different crop's score.
- Saved failures are visible and require explicit retry. Failed observations do
  not cause repeated automatic inference on remount. A new detector snapshot or a
  capable device resuming an unavailable observation may try again.
- Inference returns an explicit outcome to the UI; failures no longer silently
  look successful. Rejected/duplicate/undetected reports do not schedule scoring.
- Main's Sightings tabs, status filters, owner menus, avatars, typography, results
  modal, social voting controls, approval badges and publication popup remain.

## Validation

`npm test`: **105 passed**. Typechecking and production web export passed.
`npm run test:browser`: **12 passed**, including two real-model UI tests:

1. Real JPEG -> full/interior padded crops -> actual browser ONNX worker -> existing
   observation RPC contract -> card and already-open modal. Scores approximately
   0.9997138 and 0.9795926 stay above/below 0.98 respectively. Saved results survive
   reload without another download/inference. No verification/credit RPC is called.
2. Missing graph -> saved failed observation, UNCERTAIN labels, no automatic retry
   after reload -> explicit retry with the real graph -> real successful scores.

Auth/Storage/DB transport is intercepted in these browser tests; the ONNX graph,
preprocessing, runtime assets and scoring are real. No hosted data is changed.
The tests require a public Supabase URL at build time to initialize the app client;
only authenticated UI cases skip when that configuration is absent.

The ONNX and original PyTorch checkpoint checksums remain unchanged. Numerical
export/parity evidence remains in M1/M2A; no graph or preprocessing was changed.

## Files and limits

Changes for this step: `App.tsx`, `components/ReportIdentification.tsx`,
`lib/death-assessment.ts`, `lib/classification-label.ts`, test fixture updates in
`tests/classification-label.test.mjs` and `tests/browser/main-ui-merge.spec.ts`;
new `tests/assessment-state.test.mjs`, `tests/browser/model-ui-integration.spec.ts`
and this document. All pre-existing unrelated work was retained.

Custom native code was typechecked but no device build was installed or exercised;
actual phone performance/native runtime compatibility still needs device QA.
Inference runs when the relevant owner UI is open, not as a new background server
job. Expo Go cannot execute the native graph. Hosted trusted inference remains the
separate, disabled/unhosted M2A proof and is not called by this frontend. Existing
feed-policy discrepancies described in the QA handoff remain unresolved.
