import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? req.headers.get("host") ?? "vibe-mcp.onebot.meobeo.ai";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const serverUrl = `${proto}://${host}`;

  const script = `#!/usr/bin/env bash
# Claude Reporter - Auto-installer
# Usage: curl -s ${serverUrl}/api/install | bash

set -euo pipefail

SERVER_URL="${serverUrl}"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS="$HOME/.claude/settings.json"
HOOK_SCRIPT="$HOOKS_DIR/claude-reporter.sh"

echo "📦 Installing Claude Reporter hook..."
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
`;

  return new NextResponse(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
