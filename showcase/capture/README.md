# Screen capture

`run.sh` re-shoots every app screen the deck uses (`../screens/*.jpg`) from the real app, so the deck can be refreshed whenever the app changes.

```sh
CHROME_PATH=/path/to/chromium showcase/capture/run.sh                    # app at origin/ante-state-machine
CHROME_PATH=/path/to/chromium showcase/capture/run.sh origin/main        # or any other ref
```

It needs Node 20+, `ffmpeg`, and a Chromium or Chrome binary (`CHROME_PATH`, or run `npx playwright install chromium` inside this folder and leave `CHROME_PATH` unset).

What it does:

1. Checks the app ref out into a scratch worktree at `.work/app` and installs its dependencies. The app source is never modified, apart from dropping in `metro.config.cjs` as the worktree's `metro.config.js`.
2. Starts the app on Expo web with the app's own demo switcher enabled (`EXPO_PUBLIC_DEV_SWITCHER=1`).
3. Drives it in headless Chromium at 390×844, device scale 3: onboarding as "Aahil" in "Hackathon crew", then Waiting, the pot card and a Ping. When the ping's countdown ends, the app reveals a real quest. The location is fixed near Union Square, San Francisco (`CAPTURE_AT=lat,lng` to change it), and the landmark comes from the app's real Wikipedia and OpenStreetMap lookup.
4. Moves the browser's location onto that landmark, so the app's own geofence check fires Arrived. It then takes the photo with the in-app camera and lets the app verify it, which produces the Verified postcard, the feed entry and the passport stamp.

Three things exist only for capture, and they're all in this folder:

- `shims/web-position.ts` is the app's `src/lib/position.ts` without its web guard, so the browser's location reaches the quest flow on web.
- `shims/web-file-system.js` is an in-memory stand-in for `expo-file-system`, which doesn't run on web.
- The browser has no camera, so it's fed a still of the landmark's own Wikipedia photo. That's the photo in the Arrived, Verified, feed and passport screens.

Wikipedia and Overpass don't send CORS headers, so the script fetches those two APIs from Node and hands the responses back to the page unchanged.
