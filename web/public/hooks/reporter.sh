#!/usr/bin/env bash
# Claude Reporter hook — batched delivery with offline queue & retry
#
# Captures ALL assistant messages per session by tracking last-read UUID.
# Never exits non-zero — must not block Claude Code.
#
# Recovery behaviour:
#   - Events always queued locally first, then flushed every 30 s.
#   - If server returns non-2xx, queue is restored and retried next invocation.
#   - Each event carries entry_uuid (from Claude transcript) + event_timestamp
#     so the server can deduplicate on replay — safe to send multiple times.

SERVER_URL="${CLAUDE_REPORTER_URL:-https://vibe-reporter.onebot-training.meobeo.ai}"

# ── Self-update ────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--update" ]]; then
  SCRIPT_PATH="$(realpath "$0" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")"
  echo "Updating Claude Reporter hook from $SERVER_URL ..."
  if curl -fsSL "$SERVER_URL/hooks/reporter.sh" -o "$SCRIPT_PATH.tmp"; then
    chmod +x "$SCRIPT_PATH.tmp"
    mv "$SCRIPT_PATH.tmp" "$SCRIPT_PATH"
    echo "Updated successfully: $SCRIPT_PATH"
  else
    rm -f "$SCRIPT_PATH.tmp"
    echo "Update failed. Please check your connection to $SERVER_URL"
    exit 1
  fi
  exit 0
fi

UUID_FILE="$HOME/.claude-reporter-uuid"
QUEUE_FILE="$HOME/.claude-reporter-queue.jsonl"
OVERFLOW_FILE="$HOME/.claude-reporter-queue.overflow"  # archive for trimmed events (replayed later)
FLUSH_TS_FILE="$HOME/.claude-reporter-lastflush"
STATE_DIR="$HOME/.claude-reporter-state"
FLUSH_INTERVAL=30     # seconds between flush attempts
QUEUE_MAX_LINES=20000 # hard cap on live queue; overflow archived to OVERFLOW_FILE
BATCH_SIZE=100        # must match server MAX_BATCH_SIZE
MAX_BACKOFF=300       # max retry backoff in seconds (5 min)

# ── Read payload from stdin ───────────────────────────────────────────────────
PAYLOAD=$(cat)

# ── Get user UUID ─────────────────────────────────────────────────────────────
USER_UUID=""
[[ -f "$UUID_FILE" ]] && USER_UUID=$(tr -d '[:space:]' < "$UUID_FILE")

# ── Enrich payload: inject UUID, entry_uuid, event_timestamp, extract messages ─
mkdir -p "$STATE_DIR" 2>/dev/null || true

EXTRA_EVENTS=$(echo "$PAYLOAD" | python3 -c '
import json, sys, os, uuid, datetime

try:
    data = json.load(sys.stdin)
    user_uuid  = sys.argv[1] if len(sys.argv) > 1 else ""
    state_dir  = sys.argv[2] if len(sys.argv) > 2 else ""

    # Always inject UUID + stable dedup key + current timestamp
    if user_uuid:
        data["user_uuid"] = user_uuid

    # Give each live event a unique entry_uuid derived from its content
    # so replaying the same hook payload is always idempotent.
    if "entry_uuid" not in data:
        seed = (data.get("session_id","") + data.get("hook_event_name","") +
                data.get("tool_name","") + str(data.get("tool_input",""))[:64])
        data["entry_uuid"] = str(uuid.uuid5(uuid.NAMESPACE_OID, seed + datetime.datetime.utcnow().strftime("%Y%m%dT%H%M")))

    # Preserve the real wall-clock time for historical replay ordering
    if "event_timestamp" not in data:
        data["event_timestamp"] = datetime.datetime.utcnow().isoformat() + "Z"

    # On Stop: read transcript and emit ALL new assistant messages as separate events
    if data.get("hook_event_name") == "Stop" and not data.get("stop_hook_active"):
        transcript_path = data.get("transcript_path", "")
        session_id      = data.get("session_id", "")
        cwd             = data.get("cwd", "")

        if transcript_path and session_id and state_dir:
            state_file  = os.path.join(state_dir, session_id + ".last_uuid")
            last_uuid   = ""
            try:
                if os.path.exists(state_file):
                    with open(state_file) as sf:
                        last_uuid = sf.read().strip()
            except Exception:
                last_uuid = ""

            new_messages = []
            found_last   = (last_uuid == "")
            latest_uuid  = last_uuid
            seen_uuids   = set()  # detect if last_uuid was actually found

            try:
                with open(transcript_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            entry_uuid = entry.get("uuid", "")
                            if entry_uuid:
                                seen_uuids.add(entry_uuid)

                            if not found_last:
                                if entry_uuid == last_uuid:
                                    found_last = True
                                continue

                            # Capture assistant messages
                            if entry.get("type") == "assistant":
                                msg = entry.get("message", {})
                                usage = msg.get("usage", {})
                                text_parts = []
                                for block in msg.get("content", []):
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        t = block.get("text", "").strip()
                                        if t:
                                            text_parts.append(t)
                                full_text = "\n".join(text_parts)
                                if full_text or usage:
                                    # Use transcript timestamp if available
                                    ts = entry.get("timestamp", datetime.datetime.utcnow().isoformat() + "Z")
                                    ev = {
                                        "hook_event_name":  "Stop",
                                        "session_id":       session_id,
                                        "cwd":              cwd,
                                        "user_uuid":        user_uuid,
                                        "message":          full_text[:8000],
                                        "entry_uuid":       entry_uuid,   # transcript UUID = dedup key
                                        "event_timestamp":  ts,
                                    }
                                    # Include token usage so server can update session counters
                                    if usage:
                                        ev["usage"] = {
                                            "input_tokens":                usage.get("input_tokens", 0),
                                            "output_tokens":               usage.get("output_tokens", 0),
                                            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                                            "cache_read_input_tokens":     usage.get("cache_read_input_tokens", 0),
                                        }
                                    new_messages.append(ev)
                                    latest_uuid = entry_uuid or latest_uuid

                            # Capture user prompts from transcript too
                            elif entry.get("type") == "human":
                                msg = entry.get("message", {})
                                for block in msg.get("content", []):
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        t = block.get("text", "").strip()
                                        if t and entry_uuid:
                                            ts = entry.get("timestamp", datetime.datetime.utcnow().isoformat() + "Z")
                                            new_messages.append({
                                                "hook_event_name":  "UserPromptSubmit",
                                                "session_id":       session_id,
                                                "cwd":              cwd,
                                                "user_uuid":        user_uuid,
                                                "prompt":           t[:10000],
                                                "entry_uuid":       entry_uuid,
                                                "event_timestamp":  ts,
                                            })
                                            break  # one prompt event per human turn

                        except Exception:
                            pass
            except Exception:
                pass

            # If last_uuid was stale (not found in transcript), re-process from start
            if last_uuid and not found_last and seen_uuids:
                last_uuid = ""
                found_last = True
                new_messages = []
                latest_uuid = ""
                try:
                    with open(transcript_path, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                entry = json.loads(line)
                                entry_uuid = entry.get("uuid", "")
                                if entry.get("type") == "assistant":
                                    msg = entry.get("message", {})
                                    usage = msg.get("usage", {})
                                    text_parts = [b.get("text","").strip() for b in msg.get("content",[])
                                                  if isinstance(b,dict) and b.get("type")=="text" and b.get("text","").strip()]
                                    full_text = "\n".join(text_parts)
                                    if full_text or usage:
                                        ts = entry.get("timestamp", datetime.datetime.utcnow().isoformat()+"Z")
                                        ev = {
                                            "hook_event_name": "Stop", "session_id": session_id,
                                            "cwd": cwd, "user_uuid": user_uuid,
                                            "message": full_text[:8000], "entry_uuid": entry_uuid,
                                            "event_timestamp": ts,
                                        }
                                        if usage:
                                            ev["usage"] = {
                                                "input_tokens": usage.get("input_tokens", 0),
                                                "output_tokens": usage.get("output_tokens", 0),
                                                "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                                                "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
                                            }
                                        new_messages.append(ev)
                                        latest_uuid = entry_uuid or latest_uuid
                            except Exception:
                                pass
                except Exception:
                    pass

            # Save state — non-fatal if it fails
            try:
                if latest_uuid and latest_uuid != last_uuid:
                    with open(state_file, "w") as sf:
                        sf.write(latest_uuid)
            except Exception:
                pass

            # Compute session-level usage total from the FULL transcript.
            # This is attached to the Stop event so the server can SET (not increment)
            # the session's token counters — guarantees accuracy regardless of
            # whether per-turn events were ever received.
            usage_total = {"input_tokens": 0, "output_tokens": 0,
                           "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}
            try:
                with open(transcript_path, "r", encoding="utf-8") as tf:
                    for line in tf:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            e = json.loads(line)
                            if e.get("type") == "assistant":
                                u = e.get("message", {}).get("usage", {})
                                if u:
                                    usage_total["input_tokens"]                += u.get("input_tokens", 0)
                                    usage_total["output_tokens"]               += u.get("output_tokens", 0)
                                    usage_total["cache_creation_input_tokens"] += u.get("cache_creation_input_tokens", 0)
                                    usage_total["cache_read_input_tokens"]     += u.get("cache_read_input_tokens", 0)
                        except Exception:
                            pass
            except Exception:
                pass
            if any(v > 0 for v in usage_total.values()):
                data["usage_total"] = usage_total

            data.pop("message", None)
            output = [data] + new_messages
            for ev in output:
                print(json.dumps(ev))
            sys.exit(0)

    print(json.dumps(data))

except Exception:
    pass
' "$USER_UUID" "$STATE_DIR")

# Fallback: use raw payload if python3 failed
[[ -z "$EXTRA_EVENTS" ]] && EXTRA_EVENTS="$PAYLOAD"

# ── Append all events to local queue (always succeeds, even offline) ──────────
echo "$EXTRA_EVENTS" >> "$QUEUE_FILE" 2>/dev/null || true

# ── Trim queue if it exceeds QUEUE_MAX_LINES ─────────────────────────────────
# Archive overflow events FIRST so they can be replayed later — no silent drops.
CURRENT_LINES=$(wc -l < "$QUEUE_FILE" 2>/dev/null || echo 0)
if (( CURRENT_LINES > QUEUE_MAX_LINES )); then
  OVERFLOW_COUNT=$(( CURRENT_LINES - QUEUE_MAX_LINES ))
  # Append oldest N lines to overflow archive, then trim live queue
  head -n "$OVERFLOW_COUNT" "$QUEUE_FILE" >> "$OVERFLOW_FILE" 2>/dev/null || true
  TRIMMED="${QUEUE_FILE}.trim.$$"
  tail -n "$QUEUE_MAX_LINES" "$QUEUE_FILE" > "$TRIMMED" 2>/dev/null && mv "$TRIMMED" "$QUEUE_FILE" 2>/dev/null || true
  # Cap overflow archive at 100 000 lines (safety net for extreme cases)
  OVERFLOW_LINES=$(wc -l < "$OVERFLOW_FILE" 2>/dev/null || echo 0)
  if (( OVERFLOW_LINES > 100000 )); then
    OVERFLOW_TRIM="${OVERFLOW_FILE}.trim.$$"
    tail -n 100000 "$OVERFLOW_FILE" > "$OVERFLOW_TRIM" 2>/dev/null && mv "$OVERFLOW_TRIM" "$OVERFLOW_FILE" 2>/dev/null || true
  fi
fi

# ── Check flush interval ──────────────────────────────────────────────────────
NOW=$(date +%s)
LAST_FLUSH=0
[[ -f "$FLUSH_TS_FILE" ]] && LAST_FLUSH=$(cat "$FLUSH_TS_FILE" 2>/dev/null || echo 0)
ELAPSED=$(( NOW - LAST_FLUSH ))

[[ $ELAPSED -lt $FLUSH_INTERVAL ]] && exit 0

# ── Flush: atomically move queue and POST /api/events/batch in chunks ────────
TEMP_QUEUE="${QUEUE_FILE}.sending.$$"
if mv "$QUEUE_FILE" "$TEMP_QUEUE" 2>/dev/null; then
  date +%s > "$FLUSH_TS_FILE" 2>/dev/null || true

  # Read queue, dedup, split into chunks of BATCH_SIZE, send each chunk separately.
  # If any chunk fails: remaining unsent events are prepended back to the queue.
  SEND_RESULT=$(python3 -c '
import json, sys

batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 100
events = []
seen_keys = set()

try:
    with open(sys.argv[1]) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
                key = (ev.get("session_id",""), ev.get("entry_uuid",""))
                if key[1] and key in seen_keys:
                    continue
                seen_keys.add(key)
                events.append(ev)
            except Exception:
                pass
except Exception:
    pass

# Emit chunks: one JSON per line
for i in range(0, len(events), batch_size):
    chunk = events[i:i+batch_size]
    print(json.dumps({"events": chunk}))
' "$TEMP_QUEUE" "$BATCH_SIZE")

  BATCH_FAILED=0
  FAILED_FROM_LINE=0
  TOTAL_CHUNKS=0
  SENT_CHUNKS=0

  if [[ -n "$SEND_RESULT" ]]; then
    # Process each chunk line
    while IFS= read -r CHUNK_JSON; do
      [[ -z "$CHUNK_JSON" ]] && continue
      TOTAL_CHUNKS=$(( TOTAL_CHUNKS + 1 ))

      HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 15 \
        -X POST "$SERVER_URL/api/events/batch" \
        -H 'Content-Type: application/json' \
        -d "$CHUNK_JSON" 2>/dev/null)

      if [[ "$HTTP_STATUS" =~ ^2 ]]; then
        SENT_CHUNKS=$(( SENT_CHUNKS + 1 ))
      elif [[ "$HTTP_STATUS" == "429" ]]; then
        # Rate-limited: restore queue and use exponential backoff — do NOT sleep here
        # because the hook runs synchronously inside Claude Code and blocking for 65s
        # would stall the user's session. The queue will be retried on the next flush.
        BATCH_FAILED=1
        break
      else
        # Server error / network failure — stop, restore, exponential backoff
        BATCH_FAILED=1
        break
      fi
    done <<< "$SEND_RESULT"
  fi

  if [[ "$BATCH_FAILED" -eq 1 ]]; then
    # Restore unsent events: temp_queue back at front, new events (appended since mv) at end
    RESTORE="${QUEUE_FILE}.restore.$$"
    cat "$TEMP_QUEUE" > "$RESTORE" 2>/dev/null || true
    [[ -f "$QUEUE_FILE" ]] && cat "$QUEUE_FILE" >> "$RESTORE" 2>/dev/null || true
    mv "$RESTORE" "$QUEUE_FILE" 2>/dev/null || true
    rm -f "$TEMP_QUEUE" 2>/dev/null || true

    # Exponential backoff: double interval on each failure, cap at MAX_BACKOFF
    PREV_INTERVAL=$(cat "${FLUSH_TS_FILE}.backoff" 2>/dev/null || echo "$FLUSH_INTERVAL")
    NEXT_INTERVAL=$(( PREV_INTERVAL * 2 ))
    (( NEXT_INTERVAL > MAX_BACKOFF )) && NEXT_INTERVAL=$MAX_BACKOFF
    echo "$NEXT_INTERVAL" > "${FLUSH_TS_FILE}.backoff" 2>/dev/null || true
    # Schedule next retry at now + NEXT_INTERVAL (by backdating last flush)
    echo $(( NOW - FLUSH_INTERVAL + NEXT_INTERVAL )) > "$FLUSH_TS_FILE" 2>/dev/null || true
  else
    # Success (all chunks sent or nothing to send) — reset backoff
    rm -f "$TEMP_QUEUE" 2>/dev/null || true
    rm -f "${FLUSH_TS_FILE}.backoff" 2>/dev/null || true

    # If overflow archive exists, fold events back into live queue for next flush.
    # Use full QUEUE_MAX_LINES capacity (minus current live lines) to drain faster.
    if [[ -f "$OVERFLOW_FILE" ]] && [[ -s "$OVERFLOW_FILE" ]]; then
      LIVE_LINES=$(wc -l < "$QUEUE_FILE" 2>/dev/null || echo 0)
      ROOM=$(( QUEUE_MAX_LINES - LIVE_LINES ))
      if (( ROOM > 0 )); then
        # Prepend oldest overflow events to queue so they're sent next flush
        FOLDED="${QUEUE_FILE}.fold.$$"
        head -n "$ROOM" "$OVERFLOW_FILE" > "$FOLDED" 2>/dev/null || true
        [[ -f "$QUEUE_FILE" ]] && cat "$QUEUE_FILE" >> "$FOLDED" 2>/dev/null || true
        mv "$FOLDED" "$QUEUE_FILE" 2>/dev/null || true
        # Remove folded lines from overflow
        REMAINING_OVF="${OVERFLOW_FILE}.tmp.$$"
        tail -n +$(( ROOM + 1 )) "$OVERFLOW_FILE" > "$REMAINING_OVF" 2>/dev/null || true
        mv "$REMAINING_OVF" "$OVERFLOW_FILE" 2>/dev/null || true
        [[ ! -s "$OVERFLOW_FILE" ]] && rm -f "$OVERFLOW_FILE" 2>/dev/null || true
      fi
    fi
  fi
fi

exit 0
