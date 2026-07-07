#!/usr/bin/env bash
# One-time setup script for a fresh Amazon Linux 2023 EC2 instance.
#
# Usage (run as ec2-user, after SSH-ing in):
#   chmod +x setup-ec2.sh
#   ./setup-ec2.sh git@github.com:yourname/hermes-polymarket.git
#
# This installs Node 20, PM2, Nginx, clones your private repo (using a
# deploy key you've already added to the instance — see README section
# "Getting your private repo onto the box"), builds the app, starts it
# under PM2, and points Nginx at it on port 80.

set -euo pipefail

REPO_URL="${1:?Usage: ./setup-ec2.sh <git-repo-url>}"
APP_DIR="$HOME/hermes-polymarket"

echo "== Installing Node 20 =="
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git nginx

echo "== Installing PM2 =="
sudo npm install -g pm2

echo "== Cloning repo =="
if [ -d "$APP_DIR" ]; then
  echo "$APP_DIR already exists, pulling latest instead of cloning."
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "== Installing dependencies =="
npm install

if [ ! -f .env ]; then
  echo "== Creating .env from .env.example (edit this afterwards!) =="
  cp .env.example .env
  sed -i 's#file:./dev.db#file:/home/ec2-user/hermes-polymarket/dev.db#' .env
fi

echo "== Prisma generate + db push =="
npx prisma generate
npx prisma db push

echo "== Seeding demo data so the dashboard isn't empty on first load =="
npm run seed || echo "Seed step failed — you can re-run 'npm run seed' manually later."

echo "== Building production bundle =="
npm run build

echo "== Starting with PM2 =="
cd "$APP_DIR"
pm2 start deploy/ecosystem.config.js
pm2 save
# Make PM2 restart the app automatically on instance reboot.
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

echo "== Configuring Nginx =="
sudo cp deploy/nginx.conf /etc/nginx/conf.d/hermes-polymarket.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "== Installing crontab =="
crontab deploy/crontab.txt

echo ""
echo "Done. App should be reachable on port 80 of this instance's public IP."
echo "PM2 status: pm2 status"
echo "Logs:       pm2 logs hermes-polymarket"
echo "Cron:       crontab -l"
