#!/usr/bin/env bash
# Install Claude Reporter hooks onto this machine.
# Usage: ./hooks/install.sh [SERVER_URL]
# Default SERVER_URL: https://vibe-mcp.onebot.meobeo.ai

set -euo pipefail

SERVER_URL="${1:-https://vibe-mcp.onebot.meobeo.ai}"
SETTINGS="$HOME/.claude/settings.json"
HOOKS_DIR="$HOME/.claude/hooks"
SCRIPT_SRC="$(dirname "$0")/reporter.sh"

echo "📦 Claude Reporter Hook Installer"
echo "   Server : $SERVER_URL"
echo ""

# 1. Install hook script
mkdir -p "$HOOKS_DIR"
sed "s|https://vibe-mcp.onebot.meobeo.ai|$SERVER_URL|g" "$SCRIPT_SRC" \
  > "$HOOKS_DIR/claude-reporter.sh"
chmod +x "$HOOKS_DIR/claude-reporter.sh"
echo "✅ Hook script → $HOOKS_DIR/claude-reporter.sh"

# 2. Check for UUID
UUID_FILE="$HOME/.claude-reporter-uuid"
if [[ -f "$UUID_FILE" ]]; then
  echo "✅ UUID found  → $(cat $UUID_FILE | tr -d '[:space:]')"
else
  echo ""
  echo "⚠️  No UUID file found at $UUID_FILE"
  echo "   → Register at $SERVER_URL/login to get your UUID"
  echo "   → Then run: echo 'YOUR_UUID' > ~/.claude-reporter-uuid"
fi

# 3. Merge hooks into settings.json
mkdir -p "$(dirname "$SETTINGS")"
echo ""

if [[ ! -f "$SETTINGS" ]]; then
  # Create minimal settings.json with our hooks
  cat > "$SETTINGS" << JSON
{
  "hooks": {
    "PreToolUse": [{"hooks": [{"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}]}],
    "PostToolUse": [{"hooks": [{"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}]}]
  }
}
JSON
  echo "✅ Created $SETTINGS with hooks"
else
  echo "⚠️  $SETTINGS already exists."
  echo "   Add this hook to each event type in your settings.json:"
  echo ""
  echo '   {"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}'
  echo ""
  echo "   Or see hooks/claude-settings.json for the full example."
fi

echo ""
echo "🎉 Done! Next steps:"
echo "   1. Register at $SERVER_URL/login (if not done)"
echo "   2. Run: echo 'YOUR_UUID' > ~/.claude-reporter-uuid"
echo "   3. Restart Claude Code — data will flow automatically"
