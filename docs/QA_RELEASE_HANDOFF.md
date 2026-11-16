# QA handoff — November 16, 2026

The identification-only database workflow is applied to the shared Supabase
project. Updated frontend code remains local and uncommitted/undeployed. Old
hosted clients may still show retired controls whose APIs are now denied. This
is a local QA handoff, not a completed hosted UI/device sign-off.

## Run and verify

Use Node 22, `npm ci` and the public client values from `.env.example` in an ignored
`.env`. Run `npm run web` for browser testing or `npm run start` for Expo Go.
Google native sign-in requires a custom build; email/password works in Expo Go.
Local clients use the configured shared database. Use designated test accounts
and images; local UI does not make production data disposable.

1. Sign in/out, switch accounts, edit profile/name and confirm private email is not
   exposed on cards. Check avatars/fallbacks; the separate community-avatar policy
   remains an outstanding migration, not a report-photo regression.
2. Submit a photo with date/place/caption. Expect durable detector processing,
   current counts/numbered boxes and publication after accepted detections.
   No local classifier, approval tag, life-status review or threshold sentence.
3. Verify actual photos load in Explore, My submissions and Results, including
   after an edit or refresh. A visible card/button alone is insufficient.
4. Try no detections, duplicate and technical failure. Empty detections/duplicates
   stay out of the feed. Terminal failures offer owner retry after the existing
   cooldown, not admin review. Leaving a saved job does not cancel processing.
5. Vote up/down, switch/remove, reload and try an author reaction. Counts persist;
   a denied save rolls back with an error. Snapshot historical points before/after:
   neither reaction nor detector publication should allocate points.
6. Edit/delete your report, check confirmation, then ensure removed posts do not
   reappear. Do not assume deletion preserves historical credits: existing cascade
   semantics remain. Other accounts cannot edit/delete someone else's post.

## Local checks recorded

Node 22 typecheck and web export passed; 104 local unit tests passed (includes
pre-existing untracked shadow tests). All 38 browser checks passed across Chromium
and Firefox desktop plus Chromium/WebKit phone layouts, with zero skips/flaky.
Image regression coverage verifies signed JPEG loading/decoding. Twelve SQL suites
passed in disposable PostgreSQL 18, including social/point separation and retired
review permissions. iOS/Android production JS/Hermes exports passed; no installed
native-device test is claimed. Browser Auth/Storage/REST is mocked, not real-account
hosted end-to-end validation.

Hosted PostgreSQL 17.11 migration 19 execution and separate post-commit catalog/state
checks passed. Three detected posts published, 10 historical credit rows totaling five points
and all social votes remained unchanged. See [rollout evidence](IDENTIFICATION_SOCIAL_ONLY.md).

## Remaining release work

- Curate and commit the current implementation/tests and exact applied migration 19.
  Exclude untracked service/shadow prototypes and superseded migrations16/17/18.
- Deploy the updated frontend through the existing Git-mirror/Vercel path, then
  test real Auth, image URLs, upload→detector→feed and social votes with QA accounts.
- Rebuild/install native binaries if used; exports alone are not device validation.
- Restrict Explore's legacy status query to the intended detected-feed behavior:
  currently an owner can also see their own pre-detection uploads there.
- Decide future point allocation independently of social votes. New allocation
  remains paused; historical rankings persist.

Do not commit `.env`, `supabase/.temp`, local data, training images, dependencies,
exports or test artifacts. Do not bulk-push migrations or silently include the
unrelated unapplied avatar policy. Documentation cleanup does not authorize any
new deployment, database write, Git commit or push.
