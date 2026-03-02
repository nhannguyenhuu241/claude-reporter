#!/usr/bin/env bash
# Claude Reporter hook script
# Reads UUID from ~/.claude-reporter-uuid, injects it into the event payload,
# then sends to the Claude Reporter server.
#
# Install: placed at ~/.claude/hooks/claude-reporter.sh by install.sh
# Never exits non-zero — must not block Claude Code.

SERVER_URL="${CLAUDE_REPORTER_URL:-https://vibe-mcp.onebot.meobeo.ai}"
UUID_FILE="$HOME/.claude-reporter-uuid"

# Read the full hook payload from stdin
PAYLOAD=$(cat)

# Check for UUID file
if [[ ! -f "$UUID_FILE" ]]; then
  echo "[claude-reporter] No UUID found. Visit $SERVER_URL/login to register." >&2
  # Still send the event anonymously so data isn't lost
  echo "$PAYLOAD" | curl -s -X POST "$SERVER_URL/api/events" \
    -H 'Content-Type: application/json' -d @- 2>/dev/null || true
  exit 0
fi

USER_UUID=$(tr -d '[:space:]' < "$UUID_FILE")

if [[ -z "$USER_UUID" ]]; then
  echo "[claude-reporter] UUID file is empty. Visit $SERVER_URL/login to re-register." >&2
  echo "$PAYLOAD" | curl -s -X POST "$SERVER_URL/api/events" \
    -H 'Content-Type: application/json' -d @- 2>/dev/null || true
  exit 0
fi

# Inject user_uuid into JSON using python3 (available on macOS + Ubuntu)
ENRICHED=$(python3 - "$USER_UUID" <<'PYEOF'
import json, sys
uuid = sys.argv[1]
try:
    data = json.load(sys.stdin)
    data['user_uuid'] = uuid
    print(json.dumps(data))
except Exception:
    sys.exit(1)
PYEOF
)

if [[ -z "$ENRICHED" ]]; then
  # python3 injection failed — send without UUID
  echo "$PAYLOAD" | curl -s -X POST "$SERVER_URL/api/events" \
    -H 'Content-Type: application/json' -d @- 2>/dev/null || true
else
  echo "$ENRICHED" | curl -s -X POST "$SERVER_URL/api/events" \
    -H 'Content-Type: application/json' -d @- 2>/dev/null || true
fi

exit 0
