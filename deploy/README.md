# Deploying to EC2 from your private GitHub repo

## 1. Push this project to your private repo

```bash
cd hermes-polymarket
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:yourname/hermes-polymarket.git
git push -u origin main
```

`.env` is already in `.gitignore` — never commit it. `.env.example` (no secrets) is committed so
the setup script has something to copy from.

## 2. Launch the EC2 instance

- AMI: **Amazon Linux 2023**
- Instance type: **t3.micro** (upgrade to t3.small later if needed — `pm2 restart` picks up the
  new size with no code changes)
- Storage: 20GB gp3 is plenty
- Security group:
  - SSH (22) — restrict to **your IP only**, not 0.0.0.0/0
  - HTTP (80) — open to 0.0.0.0/0
  - HTTPS (443) — open to 0.0.0.0/0 (for later, once you add a domain + certbot)
  - Leave 3000 closed — Nginx is the only thing that should talk to Node directly
- Key pair: create/download one, you'll need it to SSH in
- (Optional but recommended) Allocate an **Elastic IP** and associate it with the instance, so the
  public IP doesn't change on stop/start

## 3. Give the instance access to your private repo

Easiest option — a **deploy key** (read-only, scoped to this one repo):

```bash
# on the EC2 instance, after SSH-ing in
ssh-keygen -t ed25519 -C "hermes-polymarket-ec2" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy that public key into **GitHub → your repo → Settings → Deploy keys → Add deploy key**
(read-only is fine, this box only needs to pull).

Then test it:

```bash
ssh -T git@github.com   # should say "Hi yourname/hermes-polymarket! You've successfully authenticated"
```

## 4. Run the setup script

```bash
scp -i your-key.pem deploy/setup-ec2.sh ec2-user@<instance-ip>:~/setup-ec2.sh
ssh -i your-key.pem ec2-user@<instance-ip>

chmod +x setup-ec2.sh
./setup-ec2.sh git@github.com:yourname/hermes-polymarket.git
```

This installs Node 20, PM2, and Nginx; clones your repo; installs dependencies; runs Prisma
generate + db push (creating `dev.db` right there on the instance's own disk, which — unlike
Vercel — persists across reboots since it's a normal EBS-backed filesystem); seeds demo data;
builds the production bundle; starts it under PM2 (auto-restarting on crash or reboot); configures
Nginx to proxy port 80 → 3000; and installs the crontab for the operational loop.

## 5. Edit `.env` for real settings

```bash
nano ~/hermes-polymarket/.env
```

Set `DATA_SOURCE_MODE=live` once you've confirmed the Polymarket adapter endpoints work (see the
main README's "Known simplifications" section), and add `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID` if you want daily reports pushed there. Then:

```bash
pm2 restart hermes-polymarket
```

## 6. Check it's alive

- `http://<instance-ip>/` should show the dashboard
- `pm2 status` — process should show `online`
- `pm2 logs hermes-polymarket` — tail the app's own logs
- `tail -f ~/hermes-polymarket/logs/cron.log` — tail the cron job output
- `crontab -l` — confirm the schedule installed correctly

## 7. Redeploying after future changes

Push to GitHub as usual, then on the instance:

```bash
cd ~/hermes-polymarket
./deploy/redeploy.sh
```

This pulls, reinstalls dependencies, re-applies any schema changes, rebuilds, and restarts PM2 —
no downtime beyond the few seconds PM2 takes to restart the process.

## 8. Cost control

- Stop (don't terminate) the instance when you're not actively testing, if you want to stretch
  the $100 credit further — an Elastic IP has a small hourly charge while *unassociated* from a
  running instance, so either terminate the EIP too or just leave the instance running if it's
  cheap enough that the EIP nuance isn't worth managing.
- Set a **AWS Budget alert** at, say, $20 and $50 so you get an email before you're surprised —
  Billing → Budgets → Create budget, in the AWS Console.
- `t3.micro` is eligible for the AWS Free Tier (750 hrs/month) for the first 12 months on a new
  account — check whether that applies to you, since it could make compute effectively free and
  leave your $100 credit almost entirely for storage/data transfer.
