# Social voting and author reactions

Upvotes/downvotes are social reactions only. They do not identify lanternflies,
assign life status, award points, affect credit eligibility or change rankings.
The current rollout is recorded in [identification/social workflow](IDENTIFICATION_SOCIAL_ONLY.md).

## Behavior

- One vote per account/report: upvote +1, downvote −1, no vote 0. Re-selecting an arrow
  removes it; choosing the other switches it. The displayed score is upvotes minus
  downvotes. A removable author upvote is seeded when a report is created.
- Authors may react to their own published posts. Authentication, vote ownership,
  uniqueness and published-report access are enforced by database policies.
- Client counts update optimistically, then refresh from stored totals. A failed
  save rolls back visibly; it must not pretend the vote persisted.
- Test switching, removing, re-adding and page reload. A zero score after removing
  the only vote is expected. Historical points must be unchanged throughout.

## Applied migrations

`20261113183923_report_author_votes.sql` enabled author reactions and seeded missing
votes on November 14. Migration19 reaffirms owner-scoped social policies while
publishing accepted detections without life-status review. Neither migration uses
social counters as the source of points. Do not reapply the seeding migration to
reset member choices.

[Author-vote access tests](../tests/report-author-votes-access.sql) cover historical
policy/seed behavior. [Identification/social access tests](../tests/identification-social-access.sql)
assert that detection publication and social reactions leave existing credits
unchanged. [Browser vote tests](../tests/browser/social-votes.spec.ts) cover the
current UI, persistence, author reactions and failed-save rollback.
