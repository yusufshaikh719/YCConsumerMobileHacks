# Ante

Friends put money into a weekly pot. At a random moment inside each person's daily free window, Ante pings: **"Sidequest in 1 minute."** A minute later it reveals a nearby landmark. Get there inside the completion window, take a selfie with the landmark behind you, and the app verifies it with a GPS geofence plus a vision check. Most sidequests completed by Sunday takes the pot.

## Run it

```sh
npm install
npm start          # scan the QR code with Expo Go on iOS or Android
```

Everything the screens show comes from `src/services`: one `AnteService` interface with a fixture implementation, so the demo runs offline in Expo Go. The Convex backend in `convex/` (pots, invites, availability, landmark discovery, geofence referee, settlement, Whop payouts) is the real implementation that service swaps to.

In development builds a small "DEV" tab on the right edge opens the state switcher: jump straight to Waiting, Ping, Quest live, Arrived, Verifying, Verified, or Time's up. Release builds show it only when built with `EXPO_PUBLIC_DEV_SWITCHER=1`.

## Checks

```sh
npm run typecheck
npm test            # vitest (backend, state machine, geofence, fixture service, full flow) + jest render tests
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
