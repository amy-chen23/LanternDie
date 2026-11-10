# LanternDie

LanternDie is an Expo app for submitting spotted lanternfly photo reports.
Reports are private by default; users can share them with signed-in members.
Reports and photos sync between the website and Expo Go. Email/password
sign-in works in Expo Go and on the website. Google sign-in works in a native
build and on the website. Rankings, verification, points, and streaks are
still placeholders.

## Public repository mirror

The [mirror workflow](.github/workflows/mirror-public.yml) copies commits from
this repository's `main` branch to the public `main` branch in
[`amy-chen23/LanternDie`](https://github.com/amy-chen23/LanternDie). It runs on
pushes to `main`, can be started manually from Actions, and retries daily.
It leaves other branches and tags alone. Direct changes to public `main` may
be overwritten by the next mirror run.

To enable it, create a fine-grained personal access token scoped to the public
repository with **Contents: Read and write** and **Workflows: Read and write**
permissions. Save it as an Actions repository secret named `PUBLIC_REPO_TOKEN`
in this source repository. Then run **Mirror to public repository** from its
Actions tab once to seed public `main`. Keep credentials and private data out
of the source `main` history before enabling the mirror.

## Run locally

### First-time setup

1. Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/).
	npm is included with Node.js; it does not need a separate installation.
2. Open a terminal in the project folder and confirm both are available:

	```sh
	node --version
	npm --version
	```

3. Install the exact dependency versions recorded in `package-lock.json`:

	```sh
	npm ci
	```

4. Install **Expo Go** on your iPhone or Android phone. This project uses Expo
	SDK 58 to work with the current iPhone App Store version. Keep the phone and computer
	connected to the same Wi-Fi network. On a physical iPhone, sign in to Expo
	Go and Expo CLI with the same free Expo account (`npx expo login`).
5. Start the app in LAN mode:

	```sh
	npx expo start --lan
	```

6. Scan the QR code shown in the terminal using Expo Go. If you are using an
	iOS Simulator on macOS, press `i` in the Expo terminal instead.

Keep the Expo terminal open while using the app. After pulling new changes, run
`npm ci` again if the lockfile has changed. Use `npm install` when adding or
updating project dependencies.

Expo Go loads from your computer's development server; the hosted website has
its own URL and remains available after the computer is turned off. Without
Supabase credentials, use **Preview the app** on the sign-in screen. Preview
mode does not create an account or persist data.

## Email authentication

1. Use the shared **LanternDie** Supabase Free project (its private report
	schema is already applied). Enable email/password authentication and disable
	**Confirm Email** for immediate sign-up without an email sender. Addresses
	are unverified, and password reset by email will not work.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
	`EXPO_PUBLIC_SUPABASE_ANON_KEY` using the project's public client key. Do not
	put a service-role key in the app or Vercel settings.
3. For a new project only, apply the private report schema in
	`supabase/migrations`; see `supabase/README.md`.
4. Restart Expo after changing environment variables.

Supabase sessions are persisted locally with AsyncStorage. Report photos are
stored in a private Supabase Storage bucket. An account can read its own
reports and public reports from other signed-in members. Each submitted image
is converted to JPEG and limited to 5 MB.
Profile pictures are saved in a separate private bucket. Users can add or
change them from Profile, and the picture appears in the Home shortcut.

Email sign-up asks for a public display name. Google users and existing users
can set or change theirs from **Profile**. The name is saved in Supabase Auth
user metadata and appears in the app instead of the sign-in email. Names are
not unique. Public reports show the uploader's display name and never show
their sign-in email.

## Website deployment

1. In **Vercel**, import this GitHub repository with `main` as the Production
	Branch and **Other** as the Framework Preset. If the GitHub organization
	does not allow Vercel access, run `vercel` from `main` instead.
2. Use the repository's `vercel.json`: it runs `npm run build:web`, exports the
	Expo web app into `dist`, and rewrites browser routes to the single-page
	app. Leave the Install Command at Vercel's default. The `.node-version`
	pins Node.js 22.16.0.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the
	Vercel **Production** and **Preview** environments, then deploy. These
	public client values are embedded into the web bundle; never use a
	service-role key.
4. Open the Production URL to verify `main`. Feature branches continue to get
	Preview URLs without changing `main`.

You can check the production web bundle locally with `npm run build:web`.
The Supabase Free project may pause after low activity; its owner can resume
it in the Supabase dashboard.

## Google sign-in

1. In Google Cloud, create an OAuth **Web application** client. Set its
   authorized redirect URI to the Supabase callback URL shown under
   **Authentication → Providers → Google** in your Supabase dashboard:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Enable the Google provider in Supabase and enter that client's ID and
   secret there. Keep the secret in Google Cloud and Supabase; it is never an
   Expo environment variable.
3. Under **Authentication → URL Configuration**, add
   `lanterndie://auth/callback`, the website URL, and any local web development
   URL to the redirect allow list. Keep the existing site URL as configured for
   email auth.
4. Set the public Supabase URL and anon key in `.env` as above, then restart
   Expo. The same remote Supabase project can serve a locally running app.

### Test locally without deployment

OAuth redirects need the `lanterndie` URL scheme registered on the device.
Expo Go cannot test this redirect. Use an iOS simulator with Xcode and
`npx expo run:ios`, or an Android emulator with Android Studio and
`npx expo run:android`. After the native app launches, tap **Continue with
Google**, complete consent, and confirm you return to the field log. Sign out,
then sign in again and restart the app to check session persistence. Cancel the
browser once to confirm you remain on the sign-in screen. Email/password and
preview mode can still be tested in Expo Go.

The Google OAuth client redirects to Supabase first; Supabase then redirects
to `lanterndie://auth/callback`. A hosted app or GitHub deployment is not
needed for this local test.

## Report overhaul in progress

On `report-overhaul`, uploads are saved as pending and queued for background
server checks. Exact duplicates are blocked, Roboflow detection creates individual
insect records, and reports publish only when every insect has a final decision.
The privacy selector and automatic phone inference have been removed from this
flow. The feed filters published reports, while Recent activity shows processing
status. Community voting now uses five-seat reviewer panels and three matching labels
per insect. Admin role discovery and moderation controls are implemented, including box
corrections, overrides, rejection/restoration, and audit history. Server alive/dead
inference remains a subsequent step. This branch's database migrations, functions, and worker schedule are deployed to
LanternDie. The hosted client still needs deployment. See
[current rollout status](docs/REPORT_OVERHAUL_ROLLOUT.md).
See [background pipeline rollout](docs/REPORT_PROCESSING_PIPELINE.md) and
[community review](docs/COMMUNITY_REVIEW.md), and [admin roles](docs/ADMIN_ROLE.md), and [moderation](docs/ADMIN_MODERATION.md).

The sections below describe the earlier model integration baseline.

## Current scope

Selecting a photo previews it locally. Before submitting, users choose an
observation date, optional general location and caption, and whether the report
is private or public. They can edit those details later in Recent activity.
Public reports appear in the Community feed for signed-in members, who can
upvote, downvote, or flag another member's report as inaccurate. The first flag
shows an inaccuracy badge; this is not a verification decision. Votes and flags
can be removed. Device GPS is not collected, and friends-only sharing is not
available until friendships exist. The submitted count updates from saved
reports. Automatic verification, true verified counts, points, and streaks
are not implemented. The temporary weekly and monthly leaderboard counts each
saved report as one verified kill; community likes, flags, and classifier
scores are excluded. Preview mode uses separate labeled sample rankings.

Native builds include experimental on-phone
alive/dead scoring after Roboflow detection, plus a separate community
verification queue with per-insect labels. All scores remain in shadow mode;
they do not automatically verify reports or award points. See
[integration and rollout instructions](ml/INTEGRATION.md) for the required
database migration and native build setup.

### Lanternfly identification

This branch adds server-side lanternfly identification after report uploads,
saved detection confidence and bounding boxes, an automatic results pop-up,
and retries for failed checks. It requires the new identification migration and
an `identify-report` Supabase Edge Function configured with the Universe general
segmentation workflow or a deployed Roboflow detector. See [setup and validation](supabase/README.md#lanternfly-identification).
Experimental native alive/dead scoring and community labels are implemented on
this branch. Automatic verification and points remain disabled. See the
[branch checkpoint](docs/MODEL_IMPLEMENTATION_CHECKPOINT.md) for tested behavior,
model limitations, deployment status, and remaining work.

## Alive/dead training experiment

The local `confidence-training/alive/` and `confidence-training/dead/` folders
contain the private training images and are ignored by Git. See
[local training instructions](ml/README.md) for auditing photos, preparing
Roboflow crops, reviewing them, and fitting a frozen MobileNetV3-Small baseline.
Generated crops, recovery checkpoints, and training artifacts stay in that ignored
directory. The deployable ONNX bundle is copied into `assets/models/` and included
in Git. Training alone does not deploy scores or change report acceptance.

The weekly and monthly top-killer, Local Star, Kill Streak, and Best Streak
badge images are in `assets/`: `weekly-top-killer.png`,
`monthly-top-killer.png`, `local-star.png`, `kill-streak.png`, and `best-streak.png`.
Local Star's five-mile radius is a design placeholder until reliable location
data is supported; the app does not currently request or use device location.

## Deploying
- Deployed url: https://lanterndie.vercel.app/
