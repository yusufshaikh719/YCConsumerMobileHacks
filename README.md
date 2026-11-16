# Ante

Friends put money into a weekly pot. At a random minute inside one of your daily sidequest windows, Ante pings: **"Sidequest in 1 minute."** A minute later it reveals a real landmark a 10–15 minute walk from where you are. Get there inside the completion window, take a selfie with the landmark behind you, and the app checks your GPS position against the landmark's geofence. Most sidequests completed by Sunday takes the pot.

## Run it

```sh
npm install
npm start          # scan the QR code with Expo Go on iOS or Android
```

First run walks you through onboarding: create a group or join one by invite code or link, then add one or more non-overlapping time windows. You can come back to it from Settings or by tapping the group name on the home screen.

Everything the screens show comes from `src/services`, behind one `AnteService` interface. The current implementation (`localService.ts`) keeps your name, group, windows, and postcards on the device with `expo-file-system`, and there is no fake data: until group sync exists, you're the only member, and screens that would show other people show an invite card instead. Landmarks come from Wikipedia's geosearch API, falling back to OpenStreetMap's Overpass API and then a wider radius (`discovery.ts`); if nothing is walkable, that day's sidequest is skipped with a clear message. The map uses `react-native-maps`, which works in Expo Go. The Convex backend in `convex/` (pots, invites, availability, settlement, Whop payouts) isn't wired to the app yet, because it has no authentication and joining a pot goes through Whop checkout.

In development builds a small "DEV" tab on the right edge opens the state switcher: jump straight to Waiting, Ping, Quest live, Arrived, Verifying, Verified, or Time's up. Quest states run real discovery from your current position. Release builds show it only when built with `EXPO_PUBLIC_DEV_SWITCHER=1`.

## Checks

```sh
npm run typecheck
npm test            # vitest (backend, state machine, windows, discovery, local service, full flow) + jest render tests
```

`npm run test:unit` and `npm run test:render` run each half on its own. Render tests live in `src/__render__` and mount every home state and secondary screen through the real provider with native modules mocked.

## Backend (Convex + Whop)

Set `EXPO_PUBLIC_CONVEX_URL` in `.env.local` to your Convex deployment URL. Configure server-only variables from your environment without writing secret values to files:

```sh
printf '%s' "$WHOP_API_KEY" | npx convex env set WHOP_API_KEY
printf '%s' "$WHOP_WEBHOOK_SECRET" | npx convex env set WHOP_WEBHOOK_SECRET
npx convex env set WHOP_ENVIRONMENT sandbox
npx convex deploy
```

The pot stake webhook is `/webhooks/whop` and the premium webhook is `/whop` on your `.convex.site` host. Use Whop's sandbox card `4242 4242 4242 4242` to test payments. This hackathon build has no authentication; derive user IDs from an authenticated identity before launch.
