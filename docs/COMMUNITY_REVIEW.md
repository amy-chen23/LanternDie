# Community review

Implemented on `report-overhaul`. Apply
`20261112000000_community_review.sql` after the database foundation and background
processing migrations. No shared project migration/deployment has been performed.

## Reviewer flow

The Community screen has an oldest-first "Needs your verification" queue. Opening
a report from that queue immediately mounts the alive/dead popup and claims
available per-insect review seats. There is no second Verify step. It displays the
actual photo and active numbered boxes in stable insect UUID order. The general
identification overlay uses the same authoritative box order. If the photo cannot
load, voting is disabled.

For each insect, members choose Alive, Dead, or Uncertain. Labels can be changed
or removed until that insect is final. Model scores and other members' vote
counts are hidden until the member submits their own label for that revision.
After submitting, only aggregate counts/model score are revealed, never reviewer
identities. Removing the label hides feedback again. A final decision is public
regardless of whether the viewer participated.

Closing/skipping releases uncommitted reservations. Submitted decisive labels
persist. Reservations also expire after 15 minutes if the app is closed, loses
connectivity, or cannot release them. Popup polling refreshes state every 15
seconds in the foreground without extending reservations. An expired/released
seat can be reclaimed using the popup button. The UI keeps the popup mounted
while its parent queue refreshes, including when consensus removes the report
from that queue.

## Database authority

- Eligible members have an app heartbeat within the past 14 days. Eligibility is
  checked when claiming AND voting. The uploader cannot review their own report.
- Panels are per insect and box revision. At most five decisive labels plus live,
  uncommitted reservations may occupy a panel. Claims/votes serialize on the
  parent report row to protect the last seat and simultaneous third votes.
- Three distinct Alive labels finalize alive; three distinct Dead labels finalize
  dead. Uncertain is neither outcome and immediately frees its temporary seat for
  a replacement. Historical uncertain reviewers can therefore exceed five; the
  bound applies to the current decisive panel and live reservations.
- Decisive votes keep their seats after claim expiry, allowing edits before the
  decision is final. An uncertain reviewer needs a new available reservation to
  submit another label. A full panel can be inspected, but cannot be joined by a
  sixth decisive reviewer.
- The third matching label finalizes the insect within the voting transaction.
  Subsequent community edits/removals fail; only admins can override a final
  decision. No appeals endpoint exists.
- Finalization calls the existing credit/publication reconciliation: all active
  insects must be final before initial publication; each dead insect earns one
  credit. All-alive sightings publish with zero. Home/profile counters and the
  leaderboard read real committed credits. Published corrections retain their
  existing snapshot until all current boxes are final.
- Box edits increment revision. Old votes remain auditable but cannot count,
  expose feedback for the new revision, or be edited through stale requests.
- Unresolved reviews enter the existing admin queue after 48 hours. Community
  voting may continue while awaiting an admin; an admin final decision takes
  precedence. Admin role discovery and a read-only queue are implemented in the next migration;
  [moderation controls](ADMIN_MODERATION.md) are implemented in the fifth migration.

`insect_review_votes` permits ordinary members to select only their own rows.
No client or service-role direct vote mutations are granted. Claims are hidden
from ordinary users. The legacy biological and social vote tables remain separate
and never contribute to quorum. Vote inserts, changes, and removals are audited
in the admin-only persistent report audit log.

The old trusted `record_report_insect_decision` RPC is now model-only; supplying
`source = community` is rejected even for the service role. Community decisions
come exclusively from the database quorum. Model automatic approval remains
disabled pending evaluation.

## API

- `claim_report_review(report_id)`: validates eligibility, reserves available
  seats, and returns active boxes, own labels, final decisions, vote availability,
  and feedback only for boxes the member has labeled.
- `get_report_review(report_id)`: same snapshot without renewing reservations.
- `set_insect_review_vote(insect_id, revision, label)`: label is alive/dead/
  uncertain, or null to remove. Requires a live claim or an existing decisive seat.
- `release_report_review(report_id)`: releases only the caller's reservations.
- `get_insect_review_feedback(insect_id, revision)`: aggregate feedback for a
  current active box, gated on having submitted one's own label. The popup uses
  the equivalent guarded feedback included in the snapshot to avoid extra calls.

The queue still uses `report_verification_queue`, filtering pending active insects
by current seat availability or an existing own label. The client explicitly
orders by report creation time then ID. A reviewer can return to edit their
existing label even when new reviewer seats are full.

## Verification and rollout

`tests/community-review-access.sql` applies the full migration chain against
Supabase-like fixtures and checks self-review, active membership, five-seat limits,
claim expiry/release, uncertain replacements, edits/removal, pre-vote privacy,
three-vote consensus, mixed/all-alive publication, credits, stale revisions,
admin veto, fresh consensus after corrections, audit, and 48-hour escalation.
Everything rolls back; use an empty disposable PostgreSQL database only. CI runs
this suite with the four existing database suites.

Type checking, the Node tests, and the production web export cover compilation
and existing worker behavior. A live two-/multi-account UI walkthrough remains
necessary after migration deployment: especially popup image alignment, navigation,
claim expiry, concurrent reviewers, and admin overrides. No live shared accounts
or Roboflow inference were used for these automated checks.

Deploy all new report-overhaul migrations with the matching client/functions and configure
the background worker schedule. The admin dashboard now supplies the in-app resolution path. Perform the
live multi-account rollout checks before a general beta release.
