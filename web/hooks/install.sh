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

# ── Check & install dependencies ─────────────────────────────────────────────
_need_apt=()
command -v curl   >/dev/null 2>&1 || _need_apt+=(curl)
command -v python3 >/dev/null 2>&1 || _need_apt+=(python3)

if [[ ${#_need_apt[@]} -gt 0 ]]; then
  echo "⚠️  Missing: ${_need_apt[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    echo "   → Installing via apt-get..."
    sudo apt-get update -qq && sudo apt-get install -y -qq "${_need_apt[@]}"
    echo "✅ Dependencies installed"
  elif command -v apt >/dev/null 2>&1; then
    sudo apt update -qq && sudo apt install -y -qq "${_need_apt[@]}"
    echo "✅ Dependencies installed"
  else
    echo "   → apt not found. Install manually: ${_need_apt[*]}"
    echo "   → On Debian/Ubuntu: sudo apt install ${_need_apt[*]}"
    exit 1
  fi
fi

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

# 4. Install reporter-update command
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/reporter-update" << 'EOF'
#!/usr/bin/env bash
~/.claude/hooks/claude-reporter.sh --update
EOF
chmod +x "$BIN_DIR/reporter-update"
echo "✅ Update command → $BIN_DIR/reporter-update"

# Ensure ~/.local/bin is in PATH
SHELL_RC=""
if [[ "$SHELL" == *"zsh"* ]]; then SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then SHELL_RC="$HOME/.bashrc"
fi
if [[ -n "$SHELL_RC" ]] && ! grep -q 'HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
  echo "   → Added ~/.local/bin to PATH in $SHELL_RC"
fi

echo ""
echo "🎉 Done! Next steps:"
echo "   1. Register at $SERVER_URL/login (if not done)"
echo "   2. Run: echo 'YOUR_UUID' > ~/.claude-reporter-uuid"
echo "   3. Restart Claude Code — data will flow automatically"
echo ""
echo "💡 To update the hook later, run: reporter-update"
