#!/usr/bin/env bash
# Claude Reporter hook — batched delivery
#
# Tất cả events được queue local và flush mỗi 30 giây một lần.
# Không có exception — mọi event type đều đi qua queue.
#
# Install: placed at ~/.claude/hooks/claude-reporter.sh by install.sh
# Never exits non-zero — must not block Claude Code.

SERVER_URL="${CLAUDE_REPORTER_URL:-https://vibe-reporter.onebot-training.meobeo.ai}"
UUID_FILE="$HOME/.claude-reporter-uuid"
QUEUE_FILE="$HOME/.claude-reporter-queue.jsonl"
FLUSH_TS_FILE="$HOME/.claude-reporter-lastflush"
FLUSH_INTERVAL=30   # 30 seconds

# ── Read payload from stdin ──────────────────────────────────────────────────
PAYLOAD=$(cat)

# ── Inject user_uuid + extract assistant message for Stop events ──────────────
USER_UUID=""
[[ -f "$UUID_FILE" ]] && USER_UUID=$(tr -d '[:space:]' < "$UUID_FILE")

ENRICHED=$(echo "$PAYLOAD" | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
    uuid = sys.argv[1] if len(sys.argv) > 1 else ""

    # Inject UUID
    if uuid:
        data["user_uuid"] = uuid

    # For Stop events, extract last assistant message from transcript JSONL
    if data.get("hook_event_name") == "Stop" and not data.get("stop_hook_active"):
        transcript_path = data.get("transcript_path", "")
        if transcript_path:
            try:
                last_text = ""
                with open(transcript_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            if entry.get("type") == "assistant":
                                msg = entry.get("message", {})
                                for block in msg.get("content", []):
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        t = block.get("text", "")
                                        if t:
                                            last_text = t
                        except Exception:
                            pass
                if last_text:
                    data["message"] = last_text[:5000]
            except Exception:
                pass

    print(json.dumps(data))
except Exception:
    pass
' "$USER_UUID")

# Fallback nếu enrichment thất bại
[[ -z "$ENRICHED" ]] && ENRICHED="$PAYLOAD"

# ── Append enriched event to local queue ─────────────────────────────────────
echo "$ENRICHED" >> "$QUEUE_FILE" 2>/dev/null || true

# ── Check flush interval ──────────────────────────────────────────────────────
NOW=$(date +%s)
LAST_FLUSH=0
[[ -f "$FLUSH_TS_FILE" ]] && LAST_FLUSH=$(cat "$FLUSH_TS_FILE" 2>/dev/null || echo 0)
ELAPSED=$(( NOW - LAST_FLUSH ))

if [[ $ELAPSED -lt $FLUSH_INTERVAL ]]; then
  exit 0
fi

# ── Flush: atomically move queue and POST to /api/events/batch ───────────────
TEMP_QUEUE="${QUEUE_FILE}.sending.$$"
if mv "$QUEUE_FILE" "$TEMP_QUEUE" 2>/dev/null; then
  date +%s > "$FLUSH_TS_FILE" 2>/dev/null || true

  EVENTS_JSON=$(python3 -c '
import json, sys

events = []
try:
    with open(sys.argv[1]) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    events.append(json.loads(line))
                except Exception:
                    pass
except Exception:
    pass

if events:
    print(json.dumps({"events": events}))
' "$TEMP_QUEUE")

  if [[ -n "$EVENTS_JSON" ]]; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/events/batch" \
      -H 'Content-Type: application/json' \
      -d "$EVENTS_JSON" 2>/dev/null)

    if [[ "$HTTP_STATUS" =~ ^2 ]]; then
      rm -f "$TEMP_QUEUE" 2>/dev/null || true
    else
      cat "$TEMP_QUEUE" >> "$QUEUE_FILE" 2>/dev/null || true
      rm -f "$TEMP_QUEUE" 2>/dev/null || true
      echo 0 > "$FLUSH_TS_FILE" 2>/dev/null || true
    fi
  else
    rm -f "$TEMP_QUEUE" 2>/dev/null || true
  fi
fi

exit 0
