#!/usr/bin/env bash
# Re-shoots showcase/screens from the app branch. Usage: showcase/capture/run.sh [git-ref]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(git -C "$here" rev-parse --show-toplevel)"
ref="${1:-${APP_REF:-origin/ante-state-machine}}"
app="${CAPTURE_APP_DIR:-$here/.work/app}"
port="${PORT:-8081}"
mkdir -p "$here/.work"

git -C "$repo" fetch --quiet origin || true
if [ -d "$app" ]; then
  git -C "$app" checkout --quiet --force --detach "$ref"
else
  git -C "$repo" worktree add --quiet --detach "$app" "$ref"
fi
(cd "$app" && npm ci --no-audit --no-fund --loglevel=error)
cp "$here/metro.config.cjs" "$app/metro.config.js"
(cd "$here" && npm install --no-audit --no-fund --loglevel=error)

(cd "$app" && ANTE_CAPTURE_DIR="$here/shims" EXPO_PUBLIC_DEV_SWITCHER=1 CI=1 exec npx expo start --web --port "$port" -c) > "$here/.work/expo.log" 2>&1 &
expo=$!
trap 'kill $expo 2>/dev/null || true; pkill -P $expo 2>/dev/null || true' EXIT
until curl -sf "http://localhost:$port" > /dev/null; do
  kill -0 $expo 2>/dev/null || { cat "$here/.work/expo.log"; exit 1; }
  sleep 2
done

APP_URL="http://localhost:$port" node "$here/capture.mjs"
