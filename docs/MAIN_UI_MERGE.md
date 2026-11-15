# Local main UI integration — November 14, 2026

Local `main` (`afb8d14`) was fast-forwarded into `report-overhaul` from `ba8f3c8`.
Main already contained the branch's committed backend history. No push, production
release, hosted mutation or model-fixing milestone was started. Local `main` was
not modified. Earlier freeze/handoff documents describe their historical snapshots;
this note records the later, explicitly requested local integration.

## Preserved behavior

Main's Home simplification, Sightings navigation/icon, Explore/My submissions/Needs
review tabs, submission filters/help, report edit/delete controls and confirmation,
profile-photo authors/fallbacks, owner social-vote controls, standardized page headers,
Roboto typography, rounded layouts and photo-results modal remain present.

The previous uncommitted browser classifier, unchanged model/threshold, grouped
DEAD/ALIVE/LIKELY DEAD/UNCERTAIN labels, captions under classification summaries,
approval icons/colors, publication popup/deduplication, lazy startup, efficient
photo URL loading, worker changes and inactive shadow foundations were retained.
The existing one-credit-per-confirmed-DEAD-insect policy was not changed.

## Conflict resolution and safety

Stash restoration conflicted in App.tsx, components/ReportIdentification.tsx,
lib/reports.ts, .github/workflows/check.yml and package-lock.json. Resolution kept
main's screen/component structure, combined author photos with cached report-photo
URLs, retained all four added SQL CI checks, and reconciled both dependency sets.
Main's fonts were installed; individual icon imports preserve startup size.

All 79 original untracked files were verified byte-identical. Original modified
files untouched by main were also verified byte-identical. The index is empty;
existing development and conflict resolutions remain uncommitted. There are no
unmerged paths. Recovery copies remain available:

- `stash@{0}`: “Preserve report-overhaul work before merging local main UI”.
- `/private/tmp/lanterndie-main-merge-obi9o078/`: private source archive, original
  patches/status, source hashes and original branch refs. Temporary files are not
  commit candidates. Do not blindly apply the stash again over the resolved tree.

Main includes two additional migration source files:
`20261113183128_community_profile_photos.sql` and
`20261113183923_report_author_votes.sql`. Importing them did not apply them to any
hosted database. Their current hosted rollout status was not checked in this task.
Existing draft 16/17/18 deployment constraints still require separate review.

## Validation

- `npm test`: 102 passed, including main's photo-result/filter/deletion tests and
  the prior classifier/provenance tests.
- `npm run typecheck`: passed.
- `npm run build:web`: passed; app JS approximately 1.1 MB, fonts served locally.
- `npm run test:browser`: 10 passed, including production worker/native-reference
  parity, app shell, throttled phone-size startup and the new authenticated UI test.
- `git diff --check`: passed; no unmerged/index entries.
- ONNX SHA remains `57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`;
  original checkpoint SHA remains `99c557bad5862504641bd09284ef1ec3b50fb885ca1b5f40ea13a2cc0994bd85`.

`tests/browser/main-ui-merge.spec.ts` exercises the real built UI with local fake
Auth/REST responses: tabs, filters, owner menus/edit/delete cancellation, avatars,
author vote availability, approved/classification/caption display and results modal.
It writes no hosted data. Authenticated UI coverage requires the public Supabase
URL configured at build time; that test explicitly skips when unconfigured.
Existing unit tests cover actual deletion-adapter outcomes and popup deduplication.
These checks do not constitute real multi-account hosted or native-phone QA.
