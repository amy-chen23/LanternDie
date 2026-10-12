# LanternDie

LanternDie is an Expo React Native starter for tracking spotted lanternfly
reports. The current skeleton includes email/password authentication,
personal progress, a profile view, and a local photo picker.

## Public repository mirror

The [mirror workflow](.github/workflows/mirror-public.yml) copies every branch
and tag from this repository to
[`amy-chen23/LanternDie`](https://github.com/amy-chen23/LanternDie). It runs on
pushes, can be started manually from Actions, and runs daily to catch changes
to older branches that do not contain the workflow yet. Branches and tags
removed from this repository are removed from the public mirror too. Changes
made directly in the public repository may be overwritten.

To enable it, create a fine-grained personal access token scoped to the public
repository with **Contents: Read and write** and **Workflows: Read and write**
permissions. Save it as an Actions repository secret named `PUBLIC_REPO_TOKEN`
in this source repository. Then merge the workflow into the source default
branch and run **Mirror to public repository** from its Actions tab once to
seed the public repository. Keep credentials and private data out of all source
branches and commit history before enabling the mirror.

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

4. Install **Expo Go** on your iPhone or Android phone. Keep the phone and
	computer connected to the same Wi-Fi network.
5. Start the app in LAN mode:

	```sh
	npx expo start --lan
	```

6. Scan the QR code shown in the terminal using Expo Go. If you are using an
	iOS Simulator on macOS, press `i` in the Expo terminal instead.

Keep the Expo terminal open while using the app. After pulling new changes, run
`npm ci` again if the lockfile has changed. Use `npm install` when adding or
updating project dependencies.

Without Supabase credentials, use **Preview the app** on the sign-in screen to
explore the interface. Preview mode does not create an account or persist data.

## Email authentication

1. Create a Supabase project and enable email/password authentication.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
	`EXPO_PUBLIC_SUPABASE_ANON_KEY` using the project's public anon key.
3. Restart Expo after changing environment variables.

The app supports email/password sign-up and sign-in only. Configure email
confirmation behavior in Supabase. Supabase sessions are persisted locally
with AsyncStorage.

## Current scope

The photo picker previews an image on-device but does not upload it. Storage,
lanternfly classification, community review, leaderboard data, and real user
statistics still need backend implementation. The initial dashboard values
are zero until those services are connected.
