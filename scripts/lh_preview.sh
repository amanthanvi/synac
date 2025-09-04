#!/usr/bin/env bash
# Run Lighthouse budgets against a locally previewed build.
# - Builds the site
# - Starts `astro preview` on port 4321 in the background
# - Waits until the server is ready
# - Runs Lighthouse with budgets config
# - Kills the preview server and exits with Lighthouse&#39;s exit code

set -u  # unset vars are errors
# Do not use `set -e`; we want to always kill the preview process on failure.

echo "[lh_preview] Building..."
npm run build || exit $?

echo "[lh_preview] Starting preview (background)..."
npm run preview >/tmp/preview.log 2>&1 &
PREVIEW_PID=$!
echo "[lh_preview] Preview PID: $PREVIEW_PID"

echo "[lh_preview] Waiting for http://localhost:4321 ..."
ATTEMPTS=60
for i in $(seq 1 $ATTEMPTS); do
  if curl -sSf -o /dev/null http://localhost:4321; then
    echo "[lh_preview] Server is up."
    break
  fi
  sleep 1
  if [ "$i" -eq "$ATTEMPTS" ]; then
    echo "[lh_preview] Server did not start within timeout." >&2
    kill "$PREVIEW_PID" 2>/dev/null || true
    exit 1
  fi
done

echo "[lh_preview] Running Lighthouse budgets..."
# Save both JSON and HTML reports under ./lighthouse for CI artifact upload
npx -y lighthouse http://localhost:4321 --quiet --chrome-flags='--headless=new' --budgets-path=./lighthouse/budgets.json --only-categories=performance --preset=desktop --no-enable-error-reporting --output=json --output=html --output-path=lighthouse/preview
CODE=$?

echo "[lh_preview] Stopping preview (PID: $PREVIEW_PID)..."
kill "$PREVIEW_PID" 2>/dev/null || true
# Give the process a moment to terminate
sleep 1

echo "[lh_preview] Done with exit code: $CODE"
exit $CODE
