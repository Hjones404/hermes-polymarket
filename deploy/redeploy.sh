#!/usr/bin/env bash
# Cron runs with a minimal PATH/env, so this wrapper makes sure node/npm are
# found and logs are appended somewhere you can check. Usage:
#   deploy/run-job.sh scan:leaderboard
#
# Also uses flock to prevent overlapping runs of the SAME job — without
# this, a slow run (e.g. score:trades processing thousands of trades) can
# still be going when the next cron tick fires 15 minutes later, causing
# both instances to read stale bankroll/state and double-act on it.
set -euo pipefail

APP_DIR="$HOME/hermes-polymarket"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

export PATH="/usr/bin:/usr/local/bin:$PATH"

JOB="${1:?Usage: run-job.sh <npm-script-name>}"
LOCK_FILE="/tmp/hermes-polymarket-${JOB//:/-}.lock"

cd "$APP_DIR"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "[$(date -u +%FT%TZ)] Skipped: npm run $JOB (previous run still in progress)" >> "$LOG_DIR/cron.log"
  exit 0
fi

echo "[$(date -u +%FT%TZ)] Starting: npm run $JOB" >> "$LOG_DIR/cron.log"
npm run "$JOB" >> "$LOG_DIR/cron.log" 2>&1
echo "[$(date -u +%FT%TZ)] Finished: npm run $JOB (exit $?)" >> "$LOG_DIR/cron.log"