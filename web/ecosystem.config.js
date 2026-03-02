/** @type {import('pm2').ProcessDescription} */
module.exports = {
  apps: [
    {
      name: "claude-reporter",
      script: "server.ts",
      interpreter: "tsx",
      env: {
        NODE_ENV: "production",
        PORT: "3005",
      },
      // Restart if memory exceeds 512MB
      max_memory_restart: "512M",
      // Auto-restart on crash
      autorestart: true,
      // Keep logs
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
