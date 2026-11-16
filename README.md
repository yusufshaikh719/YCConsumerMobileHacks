# Ante

Friends put money into a weekly pot. At a random minute inside one of your daily sidequest windows, Ante pings: **"Sidequest in 1 minute."** A minute later it reveals a real landmark a 10–15 minute walk from where you are. Get there inside the completion window, take a selfie with the landmark behind you, and the app checks your GPS position against the landmark's geofence. Most sidequests completed by Sunday takes the pot.

## Run it

```sh
npm install
npm start          # scan the QR code with Expo Go on iOS or Android
```

First run walks you through onboarding: create a group or join one by invite code or link, then add one or more non-overlapping time windows. You can come back to it from Settings or by tapping the group name on the home screen.

Everything the screens show comes from `src/services`, behind one `AnteService` interface. By default the app talks to the shared dev deployment `https://brilliant-crow-271.convex.cloud` through `convexService.ts`, with no env setup: groups, invites, stamps, reactions, standings, and the pot live in Convex and sync live across phones. Set `EXPO_PUBLIC_CONVEX_URL` to point at a different deployment (`src/services/convexUrl.ts` resolves it). Identity is demo-only: a name plus a random per-device id saved on the phone, with no account or auth. Joining a code the server doesn't know fails with "We couldn't find that group". Offline mode (`localService.ts`, everything on the device) runs only when you start with `EXPO_PUBLIC_ANTE_OFFLINE=1`; onboarding and home then show an "Offline mode: not synced" banner, and joining a friend's code is refused because their group isn't on this phone. Landmarks come from Wikipedia's geosearch API, falling back to OpenStreetMap's Overpass API and then a wider radius (`discovery.ts`); if nothing is walkable, that day's sidequest is skipped with a clear message. The map uses `react-native-maps`, which works in Expo Go. A completion is checked on the server: the reported position must be inside the landmark's geofence (registered when the quest started) before the window closes, and the selfie goes to the VLM referee (OpenAI or Gemini), which can reject it. If the VLM is unavailable, the stamp is recorded and labeled GPS-only.

In development builds a small "DEV" tab on the right edge opens the state switcher: jump straight to Waiting, Ping, Quest live, Arrived, Verifying, Verified, or Time's up. Quest states run real discovery from your current position. Release builds show it only when built with `EXPO_PUBLIC_DEV_SWITCHER=1`.

## Checks

```sh
npm run typecheck
npm test            # vitest (backend, state machine, windows, discovery, local service, full flow) + jest render tests
```

`npm run test:unit` and `npm run test:render` run each half on its own. Render tests live in `src/__render__` and mount every home state and secondary screen through the real provider with native modules mocked.

## Backend (Convex + Whop)

The app uses the shared dev deployment unless `EXPO_PUBLIC_CONVEX_URL` (for example in `.env.local`) names another one. Configure server-only variables from your environment without writing secret values to files:

```sh
printf '%s' "$WHOP_API_KEY" | npx convex env set WHOP_API_KEY
printf '%s' "$WHOP_WEBHOOK_SECRET" | npx convex env set WHOP_WEBHOOK_SECRET
npx convex env set WHOP_ENVIRONMENT sandbox
npx convex deploy
```

Also set `WHOP_COMPANY_ID` (the `biz_…` id of the account the API key belongs to) or checkout falls back and the app says payments are off. Both `/whop` and `/webhooks/whop` on your `.convex.site` host credit pot buy-ins (checkout metadata `purpose: "pot"`); `/whop` also handles premium. The weekly buy-in is $20; at the Sunday 9 PM deadline the hourly cron settles the week, pays the player with the most stamps through a Whop transfer to the Whop account that paid, and opens the next week. `node scripts/ante-live-pass.mjs` runs a two-phone pass against a deployment. Use Whop's sandbox card `4242 4242 4242 4242` to test payments. This hackathon build has no authentication; derive user IDs from an authenticated identity before launch.
