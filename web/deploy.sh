#!/usr/bin/env bash
# Deploy claude-reporter web to VPS
# Usage: ./deploy.sh
set -euo pipefail

# ── Config ──────────────────────────────────────────────
VPS_HOST="109.237.64.9"
VPS_PORT="234"
VPS_USER="nhannh"
VPS_DIR="/home/nhannh/claude-reporter"
APP_PORT="3005"
# ────────────────────────────────────────────────────────

SSH="ssh -p $VPS_PORT -i ~/.ssh/claude_reporter_deploy $VPS_USER@$VPS_HOST"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Deploying claude-reporter → $VPS_USER@$VPS_HOST:$VPS_PORT"
echo "   Remote dir : $VPS_DIR"
echo "   App port   : $APP_PORT"
echo ""

# 1. Build locally
echo "📦 Building Next.js..."
cd "$SCRIPT_DIR"
npm run build

# 2. Sync files (exclude heavy dirs)
echo ""
echo "📤 Uploading to VPS..."
rsync -avz --progress \
  -e "ssh -p $VPS_PORT -i ~/.ssh/claude_reporter_deploy" \
  --exclude "node_modules" \
  --exclude ".next/cache" \
  --exclude "prisma/*.db" \
  --exclude "prisma/*.db-journal" \
  --exclude ".env" \
  "$SCRIPT_DIR/" \
  "$VPS_USER@$VPS_HOST:$VPS_DIR/"

# 3. Remote setup & restart
echo ""
echo "⚙️  Setting up on VPS..."
$SSH bash << REMOTE
  set -euo pipefail

  # Load nvm so node/npm/pm2 are available in non-interactive SSH
  export NVM_DIR="\$HOME/.nvm"
  [ -s "\$NVM_DIR/nvm.sh" ] && source "\$NVM_DIR/nvm.sh"

  cd $VPS_DIR

  # Install Node deps
  echo "  → npm install --production"
  npm install --production

  # Generate Prisma client
  echo "  → prisma generate"
  npx prisma generate

  # Create .env if not exists (never overwrite existing one)
  if [[ ! -f .env ]]; then
    echo "  → creating .env"
    cp .env.example .env
    sed -i "s/PORT=3456/PORT=$APP_PORT/" .env
    echo "  ⚠️  Created .env — edit it at $VPS_DIR/.env if needed"
  fi

  # Init DB (idempotent)
  echo "  → prisma db push"
  npx prisma db push

  # Reload/start with PM2
  if pm2 list | grep -q "claude-reporter"; then
    echo "  → pm2 reload claude-reporter"
    pm2 reload claude-reporter
  else
    echo "  → pm2 start"
    pm2 start ecosystem.config.js
    pm2 save
  fi

  echo ""
  echo "✅ Done! App running on port $APP_PORT"
REMOTE

echo ""
echo "🌐 Dashboard: http://$VPS_HOST:$APP_PORT"
echo "🔗 Hook endpoint: http://$VPS_HOST:$APP_PORT/api/events"
echo ""
echo "💡 Update hooks on each dev machine:"
echo "   ./hooks/install.sh http://$VPS_HOST:$APP_PORT"
