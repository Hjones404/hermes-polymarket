#!/usr/bin/env bash
# Run this after pushing new commits to your private GitHub repo, to pull
# them onto the EC2 box, rebuild, and restart the running process.
#
# Usage: ./deploy/redeploy.sh

set -euo pipefail

APP_DIR="$HOME/hermes-polymarket"
cd "$APP_DIR"

echo "== Pulling latest from git =="
git pull

echo "== Installing any new dependencies =="
npm install

echo "== Applying any schema changes =="
npx prisma generate
npx prisma db push

echo "== Rebuilding =="
npm run build

echo "== Restarting PM2 process =="
pm2 restart hermes-polymarket

echo "Done. pm2 status:"
pm2 status
