# LanternDie

LanternDie is an Expo app for spotted lanternfly sightings. Uploaded photos pass
through the existing Roboflow detector and return counts and numbered boxes.
Profile field points total upvotes minus downvotes across all of a member's
posts, including private posts, and may be negative. Historical kill credits
and leaderboard rankings remain separate. The alive/dead classifier,
approval tags and life-status review UI have been removed.

As of November 16, 2026, the matching Supabase migration is applied. Updated
frontend work remains local and has not been committed/pushed for deployment.
Historical kill credits persist; new kill-credit allocation is paused.
Start with [current documentation](docs/README.md).

## Local setup

Use Node 22 (see [.node-version](.node-version)) and the locked dependencies:

```sh
npm ci
cp .env.example .env
npm run web
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` to the
existing project's public client values. Restart Expo after changing them.
Never use a service-role key in the frontend. Without configuration, the sign-in
screen offers a clearly labeled preview that does not persist reports.

For Expo Go, run `npm run start` and scan the QR code on the same reachable network.
If the phone cannot reach the development server, diagnose LAN access before
changing app/model code. A development tunnel is an optional temporary transport.
For custom native builds, use `npm run ios` or `npm run android` with the platform
tooling installed. Rebuild old binaries to remove their unused native ONNX runtime.

The configured shared Supabase project is real even when the UI runs locally.
Use designated QA accounts/reports. Photos are normalized to JPEG and stored in
private buckets. Background detection is durable after report creation; closing
the screen before upload/save finishes is not a resumable upload.

## Authentication and profiles

Email/password authentication uses the existing Supabase Auth configuration and
works in Expo Go and the website. Sessions persist with AsyncStorage. Display
names are public and editable; sign-in email is not shown on sighting cards.
Profile pictures use the separate private `profile-photos` bucket.

Click a sighting author's name or photo to open their member profile; clicking
yourself opens My Profile. Both views load field points when opened, with a
retry action if loading fails. The total uses
`supabase/migrations/20261115000000_profile_field_points.sql`, which must be
applied separately if it is not already installed. Private post details and
sign-in emails are not exposed on member profiles.

Google sign-in uses the provider configured in Supabase. Keep its OAuth client
secret in Google/Supabase, never Expo public variables. Its Google callback is
`https://<project-ref>.supabase.co/auth/v1/callback`. Supabase's redirect allowlist
needs the actual website/local browser origin and `lanterndie://auth/callback` for
native custom builds. Expo Go cannot test that custom-scheme OAuth return flow.
Check cancellation, sign-out, account switching and restart/session persistence.

## Detection and data

The existing scheduled Supabase worker sends saved images to Roboflow. The app
contains no Python/PyTorch/ONNX inference runtime. See
[server setup](supabase/README.md), [background processing](docs/REPORT_PROCESSING_PIPELINE.md)
and [database/storage](docs/REPORT_OVERHAUL_DATABASE.md).

Do not run a blanket migration push: this checkout still contains unrelated,
unapplied prototype drafts. The already-applied identification/social migration
must be committed with its exact source. See [verified rollout](docs/IDENTIFICATION_SOCIAL_ONLY.md).
Historical database records and original model/training sources are retained;
offline experiments under `ml/` and unused prototypes are not app/deployment paths.

## Validation

```sh
npm test
npm run typecheck
npm run build:web
npx playwright install chromium
npm run test:browser
```

For the full local browser matrix, install Chromium/WebKit/Firefox and run
`npx playwright test --config playwright.qa.config.ts`. SQL fixtures require a
separate disposable PostgreSQL database. Browser transport is mocked; the
[QA handoff](docs/QA_RELEASE_HANDOFF.md) distinguishes local and hosted checks.

## Existing website deployment

The existing Vercel project serves [lanterndie.vercel.app](https://lanterndie.vercel.app/).
[vercel.json](vercel.json) runs `npm run build:web`, exports `dist` and uses the SPA
rewrite. Public Supabase client values must be configured for the chosen environment;
server/Roboflow/worker credentials must never be included in that static bundle.

The [mirror workflow](.github/workflows/mirror-public.yml) synchronizes all source
branches to the same branch names in [the public mirror](https://github.com/amy-chen23/LanternDie).
It runs on branch pushes, manual invocation and its schedule, including branch
force-updates/deletions. Direct edits to mirror branches can be overwritten. The
existing `PUBLIC_REPO_TOKEN` Actions secret authorizes mirror writes; never put
its value in source or remote URLs. Vercel's production deployment follows main
in that mirror, so a source main push can release the app. Review/approve the
source selection before pushing; no new project or classifier service is needed.
