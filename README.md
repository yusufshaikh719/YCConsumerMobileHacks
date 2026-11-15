# Ante / Habit Pot — YC Consumer Mobile Hackathon

## Whop premium paywall

Install dependencies with `npm install`, then start the app with `npm start`.
Set `EXPO_PUBLIC_CONVEX_URL` to your Convex deployment URL in `.env.local`.

The app charges $10 USD once for premium access, separately from pot stakes.
`whop:createPremiumCheckout` creates a sandbox checkout through `@whop/sdk`,
attaches the selected user's ID and a server-created purchase ID as metadata,
and returns `purchase_url`. The app opens that URL with
`expo-web-browser`'s `openBrowserAsync` and subscribes to premium status.
Closing the browser never grants access. Whop checkout requests time out after
eight seconds without retries; an unavailable checkout returns a fallback state
without granting premium.

Configure server-only variables from your machine's environment without putting
secret values in files or command arguments:

```sh
printf '%s' "$WHOP_API_KEY" | npx convex env set WHOP_API_KEY
printf '%s' "$WHOP_WEBHOOK_SECRET" | npx convex env set WHOP_WEBHOOK_SECRET
npx convex env set WHOP_ENVIRONMENT sandbox
npx convex deploy
```

In the **sandbox** Whop dashboard, configure a v1 `payment.succeeded` webhook
to `https://<your-deployment>.convex.site/whop`. Its signing secret must match
`WHOP_WEBHOOK_SECRET` exactly, including the prefix. The HTTP action verifies
the raw body with `unwrapWebhook`, checks the USD amount and purchase metadata,
and marks only the matching user premium in an idempotent mutation. Other
events and pot stake payments cannot unlock premium. The existing
`/webhooks/whop` endpoint remains dedicated to pot stake fulfillment.

For this deployment, the premium webhook URL is
`https://brilliant-crow-271.convex.site/whop`.

Use Whop's sandbox card `4242 4242 4242 4242`, a future expiry and any three-digit
CVC to test a payment. Access should update automatically after the webhook
arrives. Run `npm run typecheck` and `npm test` to check the integration locally.

This hackathon app uses a demo player selector, not authenticated accounts.
The paywall is a UI gate, not a production authorization boundary. Before
launching, add authentication, derive user IDs from the authenticated identity,
and enforce premium access in protected Convex functions. Sandbox and production
keys, webhook secrets, and checkout data are separate; only switch
`WHOP_ENVIRONMENT` to `production` together with the matching credentials.
