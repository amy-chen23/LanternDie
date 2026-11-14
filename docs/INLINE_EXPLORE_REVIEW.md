# Inline Explore review — November 14, 2026

Eligible non-owner Explore cards now ask **“Is this lanternfly alive or dead?”**
with Alive, Dead and Uncertain responses. The inline panel shows a small photo
with the selected insect highlighted and a full-photo link. A successful save
shows “Thanks!” for 1.2 seconds, then dismisses the prompt; the post remains in
the feed. In multi-insect photos, one response applies only to the highlighted
insect. A “Review another lanternfly” link allows an optional next response.

The existing Needs review tab/full review modal remains available, including
changing/removing labels while permitted by the backend. Existing per-insect
five-seat, three-matching-vote, eligibility, owner restrictions, revision checks,
uncertainty handling, publication and one-credit-per-confirmed-DEAD rules remain.
Social up/downvotes stay separate.

Implementation:

- `lib/reviews.ts`: read-only eligibility lookup against the existing
  `report_verification_queue`, filtered to visible report IDs. It avoids the
  separate review queue's page limit without reserving seats or changing RLS.
- `App.tsx`: fetch eligibility with Explore, render inline review on non-owner
  cards, and quietly refresh after a response so the card stays mounted.
- `components/InlineCommunityReview.tsx`: read current review rows without claims;
  claim only on click, recheck exact insect/revision and server-granted seat,
  save through `set_insect_review_vote`, then release unused reservations.
  Browsing does not consume panel seats. A failed/stale/full-seat save never
  shows a false “Thanks!”. Voting is disabled until a valid photo/box is loaded.
- `lib/community-review.ts`: helpers for selecting an unanswered insect and
  validating its photo bounds.

Previous responses come from the server and are not asked again for the same
revision after reload. A corrected revision may require a new response. A normal
review response does not remove the post; moderator rejection/deletion and existing
access rules still apply. No new feed publication policy was implemented.

Validation: 109 unit tests, typecheck, web export and 16 browser tests passed.
New browser coverage uses real built UI with intercepted Auth/Storage/REST to test
acknowledgement/dismissal, retained post after finalization, double-click protection,
multi-insect/uncertain responses, reload behavior, failed saves, full seats, stale
revisions and self-review exclusion. Existing model/UI checks remain passing.
Real multi-account hosted QA remains necessary; no hosted votes were cast by tests.

No migrations, deployments, credit recalculations, commits or pushes were performed.
