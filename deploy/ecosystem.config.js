// PM2 process definition. Run from the repo root with:
//   pm2 start deploy/ecosystem.config.js
//
// Keeps the Next.js production server alive, restarts it on crash, and
// rotates logs. Env vars come from .env via Next.js's own dotenv loading —
// PM2 doesn't need to inject them separately as long as `npm run build`
// and `npm run start` are run with a .env file present in the repo root.

module.exports = {
  apps: [
    {
      name: "hermes-polymarket",
      cwd: __dirname + "/..",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "400M",
      out_file: "~/.pm2/logs/hermes-polymarket-out.log",
      error_file: "~/.pm2/logs/hermes-polymarket-error.log",
      time: true,
    },
  ],
};
