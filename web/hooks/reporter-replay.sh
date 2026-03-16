#!/usr/bin/env bash
# reporter-replay.sh — Replay missed Claude sessions to Claude Reporter
#
# Usage:
#   ./reporter-replay.sh                     # replay all sessions from ~/.claude/projects/
#   ./reporter-replay.sh --days 7            # only sessions from last 7 days
#   ./reporter-replay.sh --session <id>      # replay a specific session
#   ./reporter-replay.sh --dry-run           # print events without sending
#
# Each event carries entry_uuid from the transcript so the server
# deduplicates automatically — safe to run multiple times.

set -euo pipefail

SERVER_URL="${CLAUDE_REPORTER_URL:-https://vibe-reporter.onebot-training.meobeo.ai}"
UUID_FILE="$HOME/.claude-reporter-uuid"
CLAUDE_PROJECTS_DIR="$HOME/.claude/projects"
BATCH_SIZE=50    # events per HTTP request
DRY_RUN=false
FILTER_SESSION=""
DAYS_BACK=0       # 0 = no limit

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --days)      DAYS_BACK="$2"; shift 2 ;;
    --session)   FILTER_SESSION="$2"; shift 2 ;;
    --server)    SERVER_URL="$2"; shift 2 ;;
    *)           echo "Unknown option: $1"; exit 1 ;;
  esac
done

USER_UUID=""
[[ -f "$UUID_FILE" ]] && USER_UUID=$(tr -d '[:space:]' < "$UUID_FILE")

if [[ -z "$USER_UUID" ]]; then
  echo "⚠️  No user UUID found at $UUID_FILE"
  echo "   Register at $SERVER_URL/login first."
  exit 1
fi

if [[ ! -d "$CLAUDE_PROJECTS_DIR" ]]; then
  echo "❌ Claude projects directory not found: $CLAUDE_PROJECTS_DIR"
  exit 1
fi

echo "🔄 Claude Reporter Replay"
echo "   Server : $SERVER_URL"
echo "   UUID   : $USER_UUID"
[[ $DAYS_BACK -gt 0 ]] && echo "   Period : last $DAYS_BACK days"
[[ -n "$FILTER_SESSION" ]] && echo "   Session: $FILTER_SESSION"
$DRY_RUN && echo "   Mode   : DRY RUN (not sending)"
echo ""

# ── Python replay engine ──────────────────────────────────────────────────────
python3 << PYEOF
import json, os, sys, datetime, urllib.request, urllib.error, time

server_url   = "$SERVER_URL"
user_uuid    = "$USER_UUID"
projects_dir = "$CLAUDE_PROJECTS_DIR"
batch_size   = $BATCH_SIZE
dry_run      = "$DRY_RUN" == "true"
days_back    = int("$DAYS_BACK")
filter_sess  = "$FILTER_SESSION"

cutoff = None
if days_back > 0:
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days_back)

def send_batch(events):
    if dry_run:
        print(f"  [DRY RUN] Would send {len(events)} events")
        return True
    body = json.dumps({"events": events}).encode()
    req  = urllib.request.Request(
        f"{server_url}/api/events/batch",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return True
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:200]
        print(f"  ⚠️  HTTP {e.code}: {body_text}")
        return False
    except Exception as ex:
        print(f"  ⚠️  Request failed: {ex}")
        return False

total_events = 0
total_sessions = 0
total_sent = 0
total_skipped = 0

# Walk all project directories
for project_dir in sorted(os.listdir(projects_dir)):
    project_path = os.path.join(projects_dir, project_dir)
    if not os.path.isdir(project_path):
        continue

    # Each project dir contains session JSONL files named <session_id>.jsonl
    for fname in sorted(os.listdir(project_path)):
        if not fname.endswith(".jsonl"):
            continue

        session_id = fname[:-6]  # strip .jsonl

        if filter_sess and session_id != filter_sess:
            continue

        jsonl_path = os.path.join(project_path, fname)

        # Apply date filter by file modification time
        if cutoff:
            mtime = datetime.datetime.utcfromtimestamp(os.path.getmtime(jsonl_path))
            if mtime < cutoff:
                total_skipped += 1
                continue

        events = []
        last_ts = None

        try:
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except Exception:
                        continue

                    entry_uuid = entry.get("uuid", "")
                    ts = entry.get("timestamp", "")
                    entry_type = entry.get("type", "")

                    if ts:
                        last_ts = ts

                    # Reconstruct CWD from project dir name
                    # ~/.claude/projects/-home-user-myproject → /home/user/myproject
                    cwd = project_dir.lstrip("-").replace("-", "/")
                    # Handle paths that start with drive-like segments on macOS
                    if not cwd.startswith("/"):
                        cwd = "/" + cwd

                    if entry_type == "human":
                        msg = entry.get("message", {})
                        for block in msg.get("content", []):
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "").strip()
                                if text and entry_uuid:
                                    events.append({
                                        "hook_event_name":  "UserPromptSubmit",
                                        "session_id":       session_id,
                                        "cwd":              cwd,
                                        "user_uuid":        user_uuid,
                                        "prompt":           text[:10000],
                                        "entry_uuid":       entry_uuid,
                                        "event_timestamp":  ts or datetime.datetime.utcnow().isoformat() + "Z",
                                    })
                                break

                    elif entry_type == "assistant":
                        msg = entry.get("message", {})
                        # Extract usage from assistant message if present
                        usage = msg.get("usage", {})
                        text_parts = []
                        for block in msg.get("content", []):
                            if isinstance(block, dict) and block.get("type") == "text":
                                t = block.get("text", "").strip()
                                if t:
                                    text_parts.append(t)
                        full_text = "\n".join(text_parts)
                        if full_text and entry_uuid:
                            ev = {
                                "hook_event_name":  "Stop",
                                "session_id":       session_id,
                                "cwd":              cwd,
                                "user_uuid":        user_uuid,
                                "message":          full_text[:8000],
                                "entry_uuid":       entry_uuid,
                                "event_timestamp":  ts or datetime.datetime.utcnow().isoformat() + "Z",
                            }
                            if usage:
                                ev["usage"] = {
                                    "input_tokens":                usage.get("input_tokens", 0),
                                    "output_tokens":               usage.get("output_tokens", 0),
                                    "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                                    "cache_read_input_tokens":     usage.get("cache_read_input_tokens", 0),
                                }
                                ev["hook_event_name"] = "PostToolUse"
                            events.append(ev)

        except Exception as ex:
            print(f"  ⚠️  Error reading {jsonl_path}: {ex}")
            continue

        if not events:
            continue

        total_sessions += 1
        total_events += len(events)

        cwd_display = project_dir[:50]
        print(f"📁 {cwd_display}")
        print(f"   Session {session_id[:16]}… · {len(events)} events · last: {last_ts or '?'}")

        # Send in batches
        sent = 0
        for i in range(0, len(events), batch_size):
            chunk = events[i:i+batch_size]
            ok = send_batch(chunk)
            if ok:
                sent += len(chunk)
                total_sent += len(chunk)
            else:
                print(f"  ❌ Failed to send chunk {i//batch_size + 1}")
                # Wait briefly before retrying next session
                time.sleep(2)
                break

        print(f"   ✅ Sent {sent}/{len(events)}")

print("")
print("═" * 50)
print(f"✅ Done: {total_sessions} sessions · {total_events} events")
print(f"   Sent: {total_sent} · Skipped (too old): {total_skipped}")
if dry_run:
    print("   (DRY RUN — nothing was actually sent)")
PYEOF
