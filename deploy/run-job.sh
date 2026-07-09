#!/usr/bin/env bash
# Cron runs with a minimal PATH/env, so this wrapper makes sure node/npm are
# found and logs are appended somewhere you can check. Usage:
#   deploy/run-job.sh scan:leaderboard
set -euo pipefail

APP_DIR="$HOME/hermes-polymarket"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

# nodesource install puts node/npm in /usr/bin; adjust if yours differs
export PATH="/usr/bin:/usr/local/bin:$PATH"

JOB="${1:?Usage: run-job.sh <npm-script-name>}"
cd "$APP_DIR"

echo "[$(date -u +%FT%TZ)] Starting: npm run $JOB" >> "$LOG_DIR/cron.log"
npm run "$JOB" >> "$LOG_DIR/cron.log" 2>&1
echo "[$(date -u +%FT%TZ)] Finished: npm run $JOB (exit $?)" >> "$LOG_DIR/cron.log"
