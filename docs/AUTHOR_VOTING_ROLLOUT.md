# Author voting fix — November 14, 2026

The user explicitly approved applying only the author-voting migration after the
local-main UI merge exposed author vote controls against older hosted policies.

Applied to the existing linked LanternDie Supabase project:
`supabase/migrations/20261113183923_report_author_votes.sql`.
Source SHA-256: `830126ff7ede5765c61d688e942b9afa904303269e0cb20ad038c8ed54583e0e`.
The unchanged source and its version/name were registered in migration history in
one transaction. No bulk migration push, app deployment, Git commit or push ran.

The migration enables authors to use social up/downvotes on published reports,
seeds a real removable author upvote for new reports, and backfills missing author
votes while preserving existing choices. **16 missing author votes were seeded**;
post-commit verification found zero missing author votes. Pending reports still
cannot receive client social insert/update votes. A selected arrow toggles off:
returning to a net score of zero in that case is expected, not a rejected save.

Validation:

- Existing author-voting SQL regression passed in disposable local PostgreSQL.
- The exact staged transaction also passed locally after migrations 14/15.
- Hosted transaction tested owner-role downvote/removal/upvote on an existing
  published report, then rolled back those probe changes before committing.
  This verifies DB policies/trigger behavior, not a real browser JWT session.
- Existing votes preserved; cached totals match actual vote rows.
- Complete kill-credit and insect-row snapshot hashes and report workflow snapshot
  matched before/after the operation. No final labels or kill credits changed.
- Separate read-only post-commit query confirmed the registered version, new
  policies, seed function, 16 reports and zero missing author votes.

Only version `20261113183923` was added. The profile-photo migration
`20261113183128` and drafts 16/17/18 were not applied. Earlier QA/M2B migration
snapshots remain historical; this note records the later authorized change.

Refresh the local app/feed before testing so `my_vote` reflects the seeded upvote.
Try switching arrows, clicking the selected arrow to remove it, and refreshing;
saved social votes should persist. This has no relationship to the classifier or
the one-credit-per-confirmed-DEAD-insect leaderboard policy, which is unchanged.
