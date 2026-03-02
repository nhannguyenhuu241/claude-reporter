#!/usr/bin/env bash
# First-time VPS setup script — run this ONCE on the VPS
# ssh nhannh@109.237.64.9 -p 234 "bash -s" < setup-vps.sh
set -euo pipefail

APP_DIR="/home/nhannh/claude-reporter"
APP_PORT="3005"

echo "🔧 Claude Reporter — VPS First-time Setup"
echo ""

# 1. Node.js via nvm (if not installed)
if ! command -v node &>/dev/null; then
  echo "📦 Installing Node.js via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  nvm alias default 22
else
  echo "✅ Node.js $(node -v) already installed"
fi

# 2. PM2
if ! command -v pm2 &>/dev/null; then
  echo "📦 Installing PM2..."
  npm install -g pm2
  pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | bash || true
else
  echo "✅ PM2 already installed"
fi

# 3. tsx (for running server.ts)
if ! command -v tsx &>/dev/null; then
  echo "📦 Installing tsx..."
  npm install -g tsx
else
  echo "✅ tsx already installed"
fi

# 4. Create app directories
mkdir -p "$APP_DIR/logs"
mkdir -p "/home/nhannh/mcp"
echo "✅ App directory  : $APP_DIR"
echo "✅ MCP directory  : /home/nhannh/mcp"

# 5. Allow port through firewall (if ufw active)
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$APP_PORT/tcp" comment "claude-reporter" || true
  echo "✅ Firewall: port $APP_PORT opened"
fi

echo ""
echo "✅ VPS setup complete!"
echo "   Now run: ./deploy.sh (from your local machine)"
