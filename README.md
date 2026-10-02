# LanternDie

LanternDie is an Expo app for submitting private spotted lanternfly photo
reports. A signed-in user's reports and photos sync between the website and
Expo Go. Community rankings, verification, points, and streaks are still
placeholders.

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
	SDK 54 to work with the iPhone App Store version. Keep the phone and computer
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
stored in a private Supabase Storage bucket; each account can read only its
own reports. Each submitted image is converted to JPEG and limited to 5 MB.

## Free website preview

1. In **Vercel**, import this GitHub repository and deploy the
	`deploy/05-preview` branch as a Preview deployment. If the GitHub
	organization does not allow Vercel access, run `vercel` from this branch
	instead. Do not merge the stacked PRs into `main` for testing.
2. Use the repository's `vercel.json`: it exports the Expo web app into `dist`
	and rewrites browser routes to the single-page app. The `.node-version`
	pins Node.js 22.16.0.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the
	Vercel **Preview** environment, then redeploy. These public client values
	are embedded into the web bundle; never use a service-role key.
4. Open the Vercel Preview URL from the deployment or final PR. Each new
	feature-branch deployment gets a preview URL without changing `main`.

You can check the production web bundle locally with `npm run build:web`.
The Supabase Free project may pause after low activity; its owner can resume
it in the Supabase dashboard.

## Current scope

Selecting a photo previews it locally. **Submit report** uploads it for the
signed-in account and adds it to Recent activity on both platforms. The
submitted count updates from saved reports. Location collection, lanternfly
classification, community review, verified counts, points, and leaderboard
data are not implemented.
