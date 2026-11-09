# Phone classification and community feedback

The app submits a resized JPEG and calls the existing `identify-report` Edge
Function. Once Roboflow has saved a `detected` result, the uploader's phone
downloads that exact stored photo and classifies each qualifying box with the
bundled ONNX model. No boxes, failed detection, or an in-progress gate means no
classifier invocation. The detector remains online; classification runs locally.

`lib/death-runtime.native.ts` verifies the model checksum, loads it once, and
checks an all-black reference prediction before scoring photos. It uses float32
NHWC RGB values in 0–255 because the React Native runtime has platform-dependent
unsigned-tensor support. Normalization and sigmoid are embedded in the model.
Every box gets 15% padding, Pillow-compatible bilinear resizing, and centered
224×224 padding. Synthetic pixel fixtures verify the resampling against Pillow.
The runtime caps decoding at four megapixels and inference at 20 boxes per photo;
larger batches remain available for community review. It does not change weights.

Owner-visible `report_death_assessments` records contain scores, model checksum,
registered threshold, detector timestamp, proposed dead decision, and failure
status. The server checks ownership, model registration, score range/count, and
the current detector snapshot. A completed record is immutable through the client
RPC. Web-only and failed attempts can be retried from Recent activity in a native
build. Closing the app before scoring finishes also requires that retry.

All results currently route to community verification, including scores above
the provisional 0.98 cutoff. These are untrusted device observations: neither
scores nor votes award points or verify a report. Other reviewers cannot see the
machine scores. No automatic decision is made from a client-supplied score.

The Community screen includes an oldest-first **Needs your verification** queue,
loaded separately from the recent feed, in batches of up to 25 reports. Each
numbered detection accepts an alive, dead, or uncertain label. A member can change
or remove their own label and cannot label their own report. Once the viewer has
labeled every box, that report leaves their queue. Other members may still review
it. Social upvotes/downvotes/flags remain separate from biological labels. Other
members' labels are hidden to reduce herd effects. There is no automatic consensus
verification yet. Private reports never appear in the queue; authors can choose
to make them public. Changing back to private hides them and their feedback.

## Enable the integration

1. Apply `supabase/migrations/20261107000000_death_assessments.sql` to the target
   Supabase project before releasing this app code (normally `supabase db push`
   after reviewing pending migrations). The existing Edge Function does not need
   redeployment. The user has since reported successful SQL Editor application
   to the shared project, including migration-history version `20261107000000`.
   See `docs/MODEL_IMPLEMENTATION_CHECKPOINT.md` before attempting to reapply it.
2. Run `npm ci`, then `npx expo run:ios` or `npx expo run:android` on a machine with
   the platform SDK installed. The ONNX config plugin adds the native module.
   Native build outputs are intentionally not committed. Stock Expo Go and the
   website keep human review available but cannot execute the phone model.
3. Sign in, submit a public photo, and confirm Roboflow boxes appear and a shadow
   score is saved for every box. Use a second account to label each numbered box.
   Confirm the first account cannot vote on its own report and that private
   reports are absent from the second account's review queue.
4. Test failure, retry, restart, multiple insects, orientation, deletion, and
   changing public/private audience on real iOS and Android devices. Measure
   memory and latency. The CLI exports validate bundling, not a native build or
   device execution. This machine lacks full Xcode, so iOS build/device execution
   is outstanding.

## Updating the model

After training and threshold analysis, run `python ml/bundle_mobile.py` using the
training venv. It copies only weights, model metadata, and the threshold policy
into `assets/models/`; it never copies dataset photos. For a new model, choose a
new version in the bundler and add a migration registering its checksum, version,
preprocessing version, and independently validated cutoff. Keep previous registry
entries for old builds and historical observations. Ship a new native app/update
through the normal release process and keep the previous bundle for rollback.
The current implementation does not download remote weights or manage OTA releases.

Use `ml/threshold.py validate` against the new independent batch before enabling
automatic acceptance. Keep detector/crop preprocessing and model version fixed.
The training pipeline JPEG-encodes intermediate crops at quality 95, whereas the
phone crops decoded uploaded JPEG pixels directly; JPEG decoder differences and
this encoding difference need end-to-end validation with actual app submissions.
Synthetic resizing parity alone does not validate predictive equivalence.

## Feedback to reviewed training examples

An administrator can query `public.death_training_candidates` to export vote
counts, report photo paths, detector snapshots, and each box. Only the service
role/admin can access that view; never put service credentials in the app.
Photos remain in private Storage, and the view excludes currently private reports.

Inspect the candidates and record a human-reviewed alive/dead/excluded label in
`public.death_training_reviews`, with a specimen/session group, dataset split,
and reviewer identifier. A trigger prevents a known specimen group from crossing
train/calibration/test splits. Recheck unknown pairs and sessions manually. Export
`public.death_reviewed_training_examples` to obtain reviewed labels and crop
coordinates; this view also excludes currently private reports. Revoked visibility
must be honored when preparing each new dataset snapshot, including previously
downloaded material.

Prepare local crops from these reviewed examples, preserving specimen groups and
keeping calibration/test material out of `confidence-training/alive` and `dead`.
Train a versioned candidate with `ml/confidence.py`, evaluate against untouched
insects, then validate its cutoff and export/bundle it. Community labels never
flow straight into the trainer, and the phone does not retrain itself. The
reviewed views are an export interface; downloading photos and dataset curation
remain an explicit administrator step.

## Checks

`npm run typecheck`, `npm test`, and `npm run build:web` validate app code and web
fallbacks. `npx expo export --platform ios --platform android` validates native
bundles and model asset inclusion. Python training/threshold tests remain under
`tests/test_confidence*.py`. `tests/death-assessment-access.sql` exercises the
migration, detection gate, owner-only scores, immutable snapshots, votes, privacy,
review queues, and training split isolation in a disposable PostgreSQL database.
