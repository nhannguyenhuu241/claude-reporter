#!/usr/bin/env bash
# Claude Reporter hook — batched delivery
#
# Captures ALL assistant messages per session by tracking last-read UUID.
# Never exits non-zero — must not block Claude Code.

SERVER_URL="${CLAUDE_REPORTER_URL:-https://vibe-reporter.onebot-training.meobeo.ai}"
UUID_FILE="$HOME/.claude-reporter-uuid"
QUEUE_FILE="$HOME/.claude-reporter-queue.jsonl"
FLUSH_TS_FILE="$HOME/.claude-reporter-lastflush"
STATE_DIR="$HOME/.claude-reporter-state"
FLUSH_INTERVAL=30   # 30 seconds

# ── Read payload from stdin ───────────────────────────────────────────────────
PAYLOAD=$(cat)

# ── Get user UUID ─────────────────────────────────────────────────────────────
USER_UUID=""
[[ -f "$UUID_FILE" ]] && USER_UUID=$(tr -d '[:space:]' < "$UUID_FILE")

# ── Enrich payload + extract ALL new assistant messages on Stop ───────────────
mkdir -p "$STATE_DIR" 2>/dev/null || true

EXTRA_EVENTS=$(echo "$PAYLOAD" | python3 -c '
import json, sys, os

try:
    data = json.load(sys.stdin)
    user_uuid  = sys.argv[1] if len(sys.argv) > 1 else ""
    state_dir  = sys.argv[2] if len(sys.argv) > 2 else ""

    # Always inject UUID into the base event
    if user_uuid:
        data["user_uuid"] = user_uuid

    # On Stop: read transcript and emit ALL new assistant messages as separate events
    if data.get("hook_event_name") == "Stop" and not data.get("stop_hook_active"):
        transcript_path = data.get("transcript_path", "")
        session_id      = data.get("session_id", "")
        cwd             = data.get("cwd", "")

        if transcript_path and session_id and state_dir:
            state_file  = os.path.join(state_dir, session_id + ".last_uuid")
            last_uuid   = ""
            if os.path.exists(state_file):
                with open(state_file) as sf:
                    last_uuid = sf.read().strip()

            new_messages = []
            found_last   = (last_uuid == "")  # if no state yet, process everything
            latest_uuid  = last_uuid

            try:
                with open(transcript_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            entry_uuid = entry.get("uuid", "")

                            # Skip until we pass the last processed entry
                            if not found_last:
                                if entry_uuid == last_uuid:
                                    found_last = True
                                continue

                            if entry.get("type") == "assistant":
                                msg = entry.get("message", {})
                                text_parts = []
                                for block in msg.get("content", []):
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        t = block.get("text", "").strip()
                                        if t:
                                            text_parts.append(t)
                                full_text = "\n".join(text_parts)
                                if full_text:
                                    new_messages.append({
                                        "hook_event_name": "Stop",
                                        "session_id":      session_id,
                                        "cwd":             cwd,
                                        "user_uuid":       user_uuid,
                                        "message":         full_text[:8000],
                                        "entry_uuid":      entry_uuid,
                                    })
                                    latest_uuid = entry_uuid or latest_uuid

                        except Exception:
                            pass
            except Exception:
                pass

            # Persist latest UUID so next Stop only reads new entries
            if latest_uuid and latest_uuid != last_uuid:
                with open(state_file, "w") as sf:
                    sf.write(latest_uuid)

            # Print base event first (without message), then each new assistant event
            # Suppress message field on base Stop event since we emit individually
            data.pop("message", None)
            output = [data] + new_messages
            for ev in output:
                print(json.dumps(ev))
            sys.exit(0)

    # Default: just print the enriched base event
    print(json.dumps(data))

except Exception as e:
    pass
' "$USER_UUID" "$STATE_DIR")

# Fallback
[[ -z "$EXTRA_EVENTS" ]] && EXTRA_EVENTS="$PAYLOAD"

# ── Append all events to queue ────────────────────────────────────────────────
echo "$EXTRA_EVENTS" >> "$QUEUE_FILE" 2>/dev/null || true

# ── Check flush interval ──────────────────────────────────────────────────────
NOW=$(date +%s)
LAST_FLUSH=0
[[ -f "$FLUSH_TS_FILE" ]] && LAST_FLUSH=$(cat "$FLUSH_TS_FILE" 2>/dev/null || echo 0)
ELAPSED=$(( NOW - LAST_FLUSH ))

[[ $ELAPSED -lt $FLUSH_INTERVAL ]] && exit 0

# ── Flush: atomically move queue and POST /api/events/batch ──────────────────
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
