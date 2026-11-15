# Frontend handoff — November 13, 2026

Backend feature development is frozen. Work from `report-overhaul`; current source
includes uncommitted files listed in [HANDOFF_COMMIT_INSTRUCTIONS.md](HANDOFF_COMMIT_INSTRUCTIONS.md).
A documentation-only commit does not transfer that uncommitted implementation to a
fresh clone. Coordinate a reviewed source snapshot before moving to another checkout.
See [QA_RELEASE_HANDOFF.md](QA_RELEASE_HANDOFF.md) for environment/test limitations.

## Existing screens and components

`App.tsx` contains sign-in/preview mode and Home (upload/report history), Community
(feed/review entry), Leaderboard (weekly/monthly), My Profile (profile photo/badges),
and the role-gated Admin screen. `ReportIdentification` displays detection/results;
`DeathAssessment.tsx` retains legacy status/voting components (do not reconnect
its old voting path); active result rendering is in `ReportIdentification`; `CommunityReview` handles per-insect
labels. `AdminAccess`, `AdminModeration` and `ModerationBoxEditor` implement gated,
versioned moderation. `CommunityApproval` and `PublicationCelebration`, with
`usePublicationCelebration`, provide approval badges and the deduplicated popup.

Begin immediately with spacing, typography, responsive/touch layouts, screen-reader
labels, focus/modal dismissal, icon+text status indicators, empty/loading/error
states, caption placement and multi-insect result layout. Keep classifier loading
out of startup and keep the page responsive. Extract presentational components
carefully from the large App file, preserving handlers and account guards.
Do not implement new backend flows, contest submission or provisional credits.

## Current API boundaries

Use existing adapters; do not write final labels/credits directly to tables:

- `lib/supabase.ts`: session/Auth client. Only public URL/anon key in frontend env.
- `lib/reports.ts`: submit/load own/public/review/admin reports; detail edits and
  social vote/flag helpers. Submission writes normalized JPEG and report; server
  jobs own detection. `Report.workflow_status`: pending_detection, pending_review,
  admin_review, published, rejected. Insects carry id, revision, box and
  pending/alive/dead label. Do not replace these with the proposed hybrid enum.
- `lib/identification.ts`: `identifyReport` invokes `retry_report_processing` with
  p_report_id. This requests durable retry, not direct frontend Roboflow inference.
- `lib/death-assessment.ts`: owner-side `assessReportLocally`, `save_death_assessment`
  RPC with report/detector timestamp/model/status/scores/error. Feedback only;
  cutoff 0.98, automatic verification false. Browser worker/native runtime handles
  the exact crop pipeline. Avoid legacy `setVerificationVote` for current review.
- `lib/reviews.ts`: get/claim_report_review(p_report_id), set_insect_review_vote
  (p_insect_id, p_revision, p_label: alive/dead/uncertain/null), release_report_review.
  Respect can_vote, final_label and feedback visibility from `ReviewInsect`.
  Three decisive matching votes; five seats; UNCERTAIN releases a seat.
- `hooks/useAdminRole.ts`: get_my_admin_status, explicit true only.
  `lib/moderation.ts`: admin_get_report_moderation and admin_moderate_report;
  retain returned version, revision, reason and refreshed snapshot requirements.
- `lib/leaderboard.ts`: get_raw_upload_leaderboard(p_period: weekly/monthly);
  historical name returns verified_kills, mapped to verifiedKills. **One credit
  per confirmed DEAD insect**, never a report/device cap. Badges do not grant credit.
- Shadow proof: future POST /api/shadow-inference, bearer JWT, exact JSON
  {reportId, insectId, revision}. Restricted internal use only; no current URL or
  app caller. Response includes shadowOnly:true, rawDeadScore, null predictedLifeStatus,
  predictionId, model/preprocessing/source hash/revision/runtime/provenance metadata.
  It cannot finalize or credit. Never send a client URL, box, score or trust flag.

Show only DEAD, ALIVE, LIKELY DEAD or UNCERTAIN as classification labels, independent
of whether a final decision came from admin/community. Keep workflow badges
separate. Final labels win; unmatched/stale crop feedback cannot label a corrected
box. Use `lib/classification-label.ts`, not new UI confidence logic. Group by label,
for example “1 ALIVE lanternfly and 2 UNCERTAIN lanternflies detected”; put the
caption below. Keep low-confidence/error/unsupported-native paths usable.

## Proposed states — design/mock work only

M1 `lib/verification-state.ts` defines per-insect PENDING, AI_CLASSIFIED, PROVISIONAL,
COMMUNITY_REVIEW, CONTESTED, VERIFIED, INCONCLUSIVE, REJECTED. These are shadow
contracts, not deployed report statuses. New numeric confidence bands are NULL and
unapproved. Do not invent thresholds, countdown activation, live totals or promises
that model feedback automatically publishes/credits a report.

Separate life label, verification state and credit state visually. Proposed credit
states are PROVISIONAL, HELD, FINALIZED, REVERSED; one insect has at most one unit.
A hold on one insect must not hide a sibling's finalized credit. Report-wide
fraud/duplicate holds may affect multiple insects under future server rules. The
proposed 24-hour provisional window starts at acceptance, not upload; no live timer
or finalization worker exists. Current leaderboard uses existing confirmed credits.

Contest UI designs may cover report/insect scope, selected insect/revision, reason,
optional private evidence, pending/qualified/resolved presentation and moderator
resolution. Actual schema uses SUBMITTED/QUALIFIED/DISMISSED/RESOLVED. Schema reason codes are detection_error, incorrect_box, life_status,
insufficient_evidence, duplicate and fraud. Submission/resolution needs backend
coordination; no contest API is
available. Do not implement a fake successful submission or public evidence link.
Social report flags remain separate from future formal contests.

## Mock view models for unavailable backend states

Use this illustrative fixture only in a local design harness/component preview.
Identifiers are deliberately non-API IDs. These fields are UI view models, not
promised RPC response fields; never persist them or mix mock totals into live data.

```ts
const mockReport = {
  id: 'mock-only-report',
  mock: true,
  insects: [
    { id: 'mock-a', label: 'LIKELY DEAD', verification: 'PROVISIONAL', credit: 'PROVISIONAL', units: 1 },
    { id: 'mock-b', label: 'DEAD', verification: 'CONTESTED', credit: 'HELD', units: 1 },
    { id: 'mock-c', label: 'DEAD', verification: 'VERIFIED', credit: 'FINALIZED', units: 1 },
    { id: 'mock-d', label: 'ALIVE', verification: 'VERIFIED', credit: 'REVERSED', units: 0 },
    { id: 'mock-e', label: 'UNCERTAIN', verification: 'COMMUNITY_REVIEW', credit: null, units: 0 },
  ],
};
const otherMockStates = ['PENDING', 'AI_CLASSIFIED', 'INCONCLUSIVE', 'REJECTED'];
const mockContestStates = ['SUBMITTED', 'QUALIFIED', 'DISMISSED', 'RESOLVED'];
```

Mock units represent proposed credit identities/current eligibility, not existing
leaderboard balances. A reversed row illustrates a prior credit removed after an
ALIVE correction; normal ALIVE observations never create credit. No new public
screen or runtime mock fallback was added during the freeze.

## Ownership and safe editing scope

UI teammate may change presentation in `components/CommunityApproval.tsx`,
`components/PublicationCelebration.tsx`, and styles/accessibility/layout portions
of App, ReportIdentification, DeathAssessment and CommunityReview. Add new
presentational components with supplied props. Preserve popup deduplication and
caption/label precedence. Admin UI may be restyled but its permission/version/box
coordinate behavior requires coordination before changes.

Coordinate edits to App handlers, `hooks/useAdminRole.ts`,
`hooks/usePublicationCelebration.ts`, classification/feed helpers and report/review/
moderation adapters: these encode safety, privacy, revisions and credit eligibility.
`lib/community-feed.ts` currently includes pre-detection uploads and is known to
conflict with the final detection-first requirement. The hosted client instead
shows published-only reports after all final decisions. Do not fix this through
UI copy alone or release draft 17; backend/client/RLS/tests need a joint change.

Backend owner retains `supabase/**`, `proofs/trusted-inference/**`, `model_service/**`,
`lib/verification-*`, model/crop/runtime/worker modules, `assets/models/**`, `ml/**`,
processing/deduplication, voting/leaderboard SQL, auth/security policy and server
secrets. Coordinate package/lockfile, CI, Vercel/build config and worker changes.
No migration application, server credential exposure, deployments, main pushes,
credit recalculation or mock-backed live behavior is part of UI handoff.
