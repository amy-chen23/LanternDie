# LanternDie

LanternDie is an Expo React Native starter for tracking spotted lanternfly
reports. The current skeleton includes email/password and Google authentication,
personal progress, a profile view, and a local photo picker.

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

The app supports email/password sign-up and sign-in. Configure email
confirmation behavior in Supabase. Supabase sessions are persisted locally
with AsyncStorage.

## Google sign-in

1. In Google Cloud, create an OAuth **Web application** client. Set its
   authorized redirect URI to the Supabase callback URL shown under
   **Authentication → Providers → Google** in your Supabase dashboard:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Enable the Google provider in Supabase and enter that client's ID and
   secret there. Keep the secret in Google Cloud and Supabase; it is never an
   Expo environment variable.
3. Under **Authentication → URL Configuration**, add
   `lanterndie://auth/callback` to the redirect allow list. Keep the existing
   site URL as configured for email auth.
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

## Current scope

The photo picker previews an image on-device but does not upload it. Storage,
lanternfly classification, community review, leaderboard data, and real user
statistics still need backend implementation. The initial dashboard values
are zero until those services are connected.
