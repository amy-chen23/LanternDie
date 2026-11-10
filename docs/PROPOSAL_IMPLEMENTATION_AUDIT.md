# Proposal implementation audit

Reviewed November 9, 2026 against `report-overhaul` at `3bf2aa7`, the supplied
high-level proposal, and all 14 supplied user stories. This is a repository
assessment, not a new live deployment or a claim that all device flows passed.

## Overall finding

The reporting and human-verification foundation exists. The largest unfinished
parts are the trusted alive/dead classifier integration and the incentive system:
points, streaks, persistent earned badges, and timed community challenges.

Several smaller acceptance gaps remain around deletion, privacy documentation,
submission examples, moderation discovery, and keeping displayed statistics fresh.
Friends and research analytics have no implemented product workflow.

The later agreed design takes precedence over the original proposal:

- Reports use a public workflow; private/friends-only reports are intentionally removed.
- Verification uses per-insect Alive/Dead/Uncertain labels, a five-seat panel, and
  three matching decisive labels. Social up/downvotes do not verify insects.
- Every active insect must have a final label before initial publication.
- One verified dead insect earns one kill credit. All-alive reports still publish.
- Admin decisions have no appeal. Unclassified insects enter Needs attention immediately.
- Duplicate checking uses exact stored-image bytes only; similarity detection is excluded.
- Automatic model approval stays disabled pending independent evaluation. The
  acceptable error target remains deferred; a 25% review rate is a preference,
  and higher review rates are allowed.

## Existing implementation to retain

- Email/password account creation and sign-in, Google OAuth integration, persisted
  sessions, display-name editing, and profile photos: `App.tsx`, `lib/supabase.ts`,
  `lib/profile-photo.ts`. Email satisfies the proposal's email and/or phone criterion;
  phone authentication is not required to satisfy that wording.
- Photo selection, JPEG preparation, optional date/place/caption, storage, and
  owner activity history: `App.tsx`, `lib/reports.ts`.
- Durable processing, SHA-256 duplicate registration, fenced leases, retry/backoff,
  Roboflow detection, and per-insect records: worker functions and migrations
  `20261110000000` / `20261111000000`.
- Per-insect human consensus, active-member eligibility, exclusion of uploader
  self-review, claims, revisions, and automatic publication/credit reconciliation:
  `components/CommunityReview.tsx`, `lib/reviews.ts`, migration `20261112000000`.
- Admin membership, role discovery, corrected bounding boxes, alive/dead overrides,
  rejection/restoration, and persistent audit: admin components and migrations
  `20261113000000` through `20261115000000`.
- Published community feed, separate social voting/flags, actual verified-kill
  totals, and weekly/monthly rankings based on committed dead-insect credit:
  `lib/reports.ts`, `lib/leaderboard.ts`, foundation reconciliation/leaderboard RPC.
- Model training, crop preprocessing, threshold-analysis tooling, ONNX export, and
  an older native shadow-inference implementation: `ml/`, `lib/death-*`,
  `assets/models/`. These are assets for the next integration, not a working
  automatic approval stage in the current upload flow.

## Acceptance checklist: supplied user stories

1. **Must: account creation/login — implemented in code.** Email/password meets
   the criterion. Native Google redirects and account persistence still need a
   real-device release walkthrough. Password recovery is an additional usability
   improvement, not an explicit supplied acceptance criterion.
2. **Must: uploads, Activity log, Lanternfly Feed — implemented in code.** Reports
   appear in Activity while pending and enter the feed after all decisions. This
   publication timing follows the later agreed design.
3. **Must: verified kills, streaks, badges, points — partial.** Kills are real;
   Home streak is literal `0`, Profile streak is `0 days`, field points are `0`,
   and badges are static LOCKED/SOON previews (`App.tsx:828`, `App.tsx:1447`).
4. **Must: accepted/rejected/review status — substantially implemented.** Activity
   shows workflow/processing messages and identification results show final
   per-insect labels. Improve the receipt to display awarded credit and, where
   appropriate, a user-facing rejection reason; currently rejection copy is generic.
5. **Must: removed/rejected submissions reverse rewards — partial.** Rejecting
   clears committed kill credit, leaderboard results derive from that credit,
   and database deletion cascades remove credit. There is no user-facing report
   deletion action/helper. Points and badge/streak correction cannot be complete
   until those systems exist.
6. **Must: explain image/location collection and link a policy — partial.** Upload
   copy explains optional general place text, no device GPS, Roboflow processing,
   and visibility. There is no linked data-collection policy. Document stored
   photos/details, metadata handling, reviewer access, external processing,
   retention/deletion, and persistent duplicate-hash tombstones. Validate metadata
   removal on supported clients before promising EXIF/GPS stripping.
7. **Should: automatic milestone badges — missing award system.** Artwork and
   descriptions exist; persistent awards, milestone evaluation, earned dates,
   and automatic profile updates do not. Decide correction/revocation rules in
   conjunction with the requirement that rejected reports cannot support rewards.
8. **Should: verified-only leaderboard — implemented, refresh gap.** The server
   ranks real credits by first publication within the week/month. The mounted
   screen loads only on mount/period change (`App.tsx:1097`); add refresh/resume
   invalidation for remote approvals/rejections. Clarify period boundaries and ties.
9. **Should: valid/invalid photo examples — missing.** No pre-upload example guide
   explains adequate evidence, common rejection cases, or difficult alive/dead poses.
10. **Should: moderator fraud removal/reward reversal — partial overall.** Admin
    rejection and kill-credit reversal exist. Points reversal awaits points.
    Improve discovery: flags currently mark reports but do not put otherwise-final
    published reports into Needs attention, which only checks workflow/pending insects.
11. **Should: sustained participation/reward milestones — missing.** No computed
    current/best streak, consecutive-day/week rules, progress, or milestone rewards.
12. **Should: friend search/requests/sharing settings — missing and partly superseded.**
    No friend graph, request lifecycle, member search, or sharing settings. Keep
    reports public under the later decision; clarify whether privacy settings
    should cover optional profile statistics rather than report visibility.
13. **Nice: anonymized regional/time research aggregates — missing.** No researcher
    view/export or approved coarse-region data model. Free-text place names are
    insufficient for reliable regional aggregation. Existing model-training views
    are a different feature and do not satisfy this story.
14. **Nice: distinguish verified/unverified/estimated impact — partial.** Personal
    submitted and verified counts are separate, and the review queue distinguishes
    pending work. There is no community summary of both measures or estimated-impact
    feature. Avoid inventing a population multiplier; if estimates are introduced,
    label and explain them separately from verified observations.

## Proposal feature outside the user-story table

**Timed collective community challenges are missing.** Weekly/monthly leaderboards
are individual rankings, not community challenges. Implement challenge definitions,
start/end windows, collective targets, progress from eligible committed credit,
completion/rewards, and correction behavior. A simple admin-created collective
kill target is enough for a first version; teams and elaborate competitions are
not necessary for the stated semester scope.

## Remaining classifier work

`process-report-jobs/processor.ts` currently hashes, detects, and completes a job;
it never invokes the trained alive/dead model. `App.tsx` explicitly performs no
device inference after upload. The old `assessReportLocally` and
`components/DeathAssessment.tsx` are not wired into the current screen flow.
`assets/models/policy.json` has automatic verification disabled and a provisional
0.98 cutoff; that is not an independently validated production policy.

To finish this proposal requirement:

1. Evaluate new, independent insects using the exact saved-photo/crop recipe;
   measure live false approvals and per-insect review coverage. Choose an acceptable
   error target and cutoff from evidence. Update the older tooling/docs that still
   assume a 1% target, since the later conversation deferred that decision.
2. Add a trusted server inference stage on the agreed free beta hosting, with
   version/checksum-bound preprocessing, scores, durable retries, and cold-start
   handling. The existing one-stage detection job must not become the sole record
   of completion if classification is still pending.
3. Bind scores and decisions to stable insect UUIDs and current box revisions;
   prevent delayed inference from overwriting admin edits or final decisions.
4. Route eligible high-score insects through the existing model-decision RPC;
   leave low-score/ambiguous insects for community review. Define failure handling
   so reports remain reviewable instead of silently disappearing or granting credit.
5. Enable automatic approval only for the evaluated model version, with an off
   switch and an end-to-end test of mixed automatic/human decisions in one photo.

Higher model accuracy is a stretch goal. The missing requirement is a functioning,
evaluated baseline and routing integration, rather than a near-perfect model.

## Integration and beta-readiness follow-ups

- **Hosted client:** the checked-in rollout record says database/functions/Cron
  are live but the matching hosted client remains pending. Verify the deployed
  revision and release this branch's client; this audit did not query production.
- **Deletion:** add confirmation, server-authorized deletion, storage cleanup,
  and refresh all affected totals; keep the duplicate tombstone as agreed.
- **Flagged-report inbox:** surface published flagged reports for admin review
  and supply a resolution/dismissal workflow so they do not remain flagged forever.
- **Pagination/statistics:** feed/reviewer lists stop at 25, admin lists at 10,
  with no load-more flow. Activity downloads every returned photo and computes
  lifetime totals from returned rows. Use server totals and paginated history so
  API row limits or many insect rows cannot silently undercount long-term progress.
- **Training feedback compatibility:** `death_training_candidates` still reads
  legacy `report_verification_votes`, while the new popup writes
  `insect_review_votes`. Reviewed-training rows also use detector array indices,
  not the corrected insect UUID/revision. Update this path before claiming that
  new community/admin decisions feed dataset curation. Retraining automation is
  not required for the proposal.
- **Documentation:** README opening/current-scope sections and `ml/INTEGRATION.md`
  still describe private reports, shadow-only counts, or the old phone flow.
  Some older docs still say 48-hour-only admin escalation. Consolidate current
  behavior so setup and evaluation follow the actual branch.
- **Real-device and multi-account checks:** exercise three distinct eligible
  reviewers plus uploader, an admin override, mixed/all-alive reports, duplicates,
  failed retries, account switching, deletion and credit reversal. Verify touch
  editing and photo orientation on iOS/Android; compilation does not establish these.
- **Release polish:** optimize the shipped artwork (several PNGs are 2–4 MB each),
  improve empty/loading/error states, and add automated tests at the app interaction
  level. Existing tests primarily cover pure logic and database access/workflows.

## Suggested implementation order

1. Close the current workflow: deletion, flagged-report inbox, clear credit/status
   receipts, privacy policy/example guide, matching client deployment and live checks.
2. Build one authoritative reward calculation from committed credit: points and
   current/best streaks, including time-zone/date and reversal rules.
3. Add persistent milestone badges and earned-badge display using those rewards.
4. Add a simple timed collective challenge using the same credit source.
5. Finish independent model evaluation and trusted server inference. Data collection
   can proceed alongside steps 1–4; keep human verification available throughout.
6. Implement friend features if retaining that should-have; research aggregation
   and impact estimates remain optional nice-to-haves.

## Verification for this audit

- `npm test`: 48 tests passed.
- `npm run typecheck`: passed.
- `npm run build:web`: passed.
- Python model-tooling tests: 12 passed using the existing training environment.
- Inspected app screens, client libraries/hooks/components, all migration stages,
  worker functions/scheduler, model tooling/artifacts, tests/CI and rollout docs.
- No migrations, production data changes, model retuning, or app deployments were
  performed. SQL access suites and native/live UI scenarios were not rerun here.
