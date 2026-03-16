import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const serverUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vibe-reporter.onebot-training.meobeo.ai";

  const script = `#!/usr/bin/env bash
# Claude Reporter - Auto-installer
# Usage: curl -s ${serverUrl}/api/install | bash

set -euo pipefail

SERVER_URL="${serverUrl}"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS="$HOME/.claude/settings.json"
HOOK_SCRIPT="$HOOKS_DIR/claude-reporter.sh"

echo "📦 Installing Claude Reporter hook..."

# ── Check & install dependencies ─────────────────────────────────────────────
_need_apt=()
command -v curl    >/dev/null 2>&1 || _need_apt+=(curl)
command -v python3 >/dev/null 2>&1 || _need_apt+=(python3)

if [[ \${#_need_apt[@]} -gt 0 ]]; then
  echo "⚠️  Missing: \${_need_apt[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    echo "   → Installing via apt-get..."
    sudo apt-get update -qq && sudo apt-get install -y -qq "\${_need_apt[@]}"
    echo "✅ Dependencies installed"
  elif command -v apt >/dev/null 2>&1; then
    sudo apt update -qq && sudo apt install -y -qq "\${_need_apt[@]}"
    echo "✅ Dependencies installed"
  else
    echo "   → apt not found. Install manually: \${_need_apt[*]}"
    echo "   → On Debian/Ubuntu: sudo apt install \${_need_apt[*]}"
    exit 1
  fi
fi

mkdir -p "$HOOKS_DIR"

# Download the hook script and embed the server URL
curl -s "$SERVER_URL/hooks/reporter.sh" \\
  | sed "s|https://vibe-mcp.onebot.meobeo.ai|$SERVER_URL|g" \\
  > "$HOOK_SCRIPT"
chmod +x "$HOOK_SCRIPT"
echo "✅ Hook script → $HOOK_SCRIPT"

# Check UUID
UUID_FILE="$HOME/.claude-reporter-uuid"
if [[ -f "$UUID_FILE" ]]; then
  echo "✅ UUID found  → $(cat "$UUID_FILE" | tr -d '[:space:]')"
else
  echo ""
  echo "⚠️  No UUID file found at $UUID_FILE"
  echo "   → Register at $SERVER_URL/login to get your UUID"
  echo "   → Then run: echo 'YOUR_UUID' > ~/.claude-reporter-uuid"
fi

# Merge into settings.json if it doesn't already have the hook
if [[ -f "$SETTINGS" ]]; then
  if grep -q "claude-reporter.sh" "$SETTINGS" 2>/dev/null; then
    echo "✅ Hook already in $SETTINGS"
  else
    echo ""
    echo "⚠️  $SETTINGS exists but doesn't have the hook."
    echo "   Add this to each hook event in your settings.json:"
    echo ""
    echo '   {"type": "command", "command": "~/.claude/hooks/claude-reporter.sh"}'
    echo ""
    echo "   Example at: $SERVER_URL/hooks/claude-settings.json"
  fi
else
  # Create minimal settings.json
  mkdir -p "$(dirname "$SETTINGS")"
  cat > "$SETTINGS" << 'JSON'
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
fi

echo ""
echo "🎉 Done! Restart Claude Code to start capturing sessions."
echo ""
echo "💡 Missed sessions? Replay all historical transcripts:"
echo "   curl -s $SERVER_URL/hooks/reporter-replay.sh > /tmp/replay.sh && bash /tmp/replay.sh"
echo "   # or with date filter:"
echo "   bash /tmp/replay.sh --days 30"
echo "   # dry-run first (no data sent):"
echo "   bash /tmp/replay.sh --dry-run"
`;

  return new NextResponse(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
