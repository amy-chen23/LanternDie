# Human-verified beta

This release uses the existing public report overhaul with human verification.
It does not deploy the alive/dead model as an approval gate or claim calibrated
death probabilities. The upload and ranking screens explicitly describe the beta.

## Report flow

1. Upload and save a report; background processing continues after navigation.
2. Check the stored photo's exact hash, then run Roboflow detection.
3. Create stable per-insect boxes. Eligible members review Alive/Dead/Uncertain;
   three matching decisive labels finalize an insect. The uploader cannot self-review.
4. Admins can correct boxes, finalize labels, reject reports, and override decisions
   with an audited reason. Unclassified insects appear in Needs attention immediately.
5. Publish after all active insects are final. Award one credit per dead insect;
   publish all-alive reports with zero credit. Rankings read committed credits.

Automatic approval remains disabled in the model registry and bundled policy.
The current worker performs detection only; **server shadow scoring is not yet
implemented**. Existing native shadow-inference modules are not called by the
current upload flow. Human decisions are therefore the current path to credit.

## Release verification

Before releasing the matching client, verify model automation remains disabled,
the worker Cron schedule is active, database migrations match the branch, and
app/Python checks pass. CI exercises all eight database workflow/access suites.
The existing website's production integration is through the public GitHub mirror;
observe an actual successful deployment before calling the hosted release complete.

Live multi-account and device testing remains necessary, including three distinct
eligible reviewers plus the uploader, an admin override, all-alive and mixed-label
reports, duplicate rejection, retries, photo orientation, and touch box editing.
Automated tests and a successful hosting build do not establish those results.

## Offline model work

Use the [adult-only workflow](../ml/README.md#adult-only-improvement-workflow).
Adult scope applies to model development, while beta human verification continues
for other detected stages. Review specimen/session groups and adult labels before
training; retain independent new insects for final candidate evaluation. Neither
augmentation nor hyperparameter tuning enables approval or changes the app model.

## Known beta limits

Points, streak rewards, earned badges, challenges, and friends are not implemented.
Deletion has no user-facing control yet. Feed/review lists are capped and the admin
list shows ten rows with exact-ID lookup. No automatic retraining or server shadow
inference exists. See the proposal audit for the broader remaining requirements.
