#!/usr/bin/env bash
# migrate-sqlite-to-postgres.sh
# Migrates data from existing SQLite DB to a running PostgreSQL instance.
#
# Usage (run on VPS before switching to the new Docker image):
#   SQLITE_DB=/home/nhannh/claude-reporter/data/claude-reporter.db \
#   PG_URL=postgresql://reporter:reporter_secret@localhost:5432/claude_reporter \
#   bash migrate-sqlite-to-postgres.sh

set -euo pipefail

SQLITE_DB="${SQLITE_DB:-./data/claude-reporter.db}"
PG_URL="${PG_URL:-postgresql://reporter:reporter_secret@localhost:5432/claude_reporter}"

command -v python3 >/dev/null 2>&1 || { echo "❌ python3 required"; exit 1; }
command -v psql    >/dev/null 2>&1 || { echo "❌ psql required (apt install postgresql-client)"; exit 1; }

if [[ ! -f "$SQLITE_DB" ]]; then
  echo "❌ SQLite DB not found: $SQLITE_DB"
  exit 1
fi

echo "🔄 Migrating SQLite → PostgreSQL"
echo "   From : $SQLITE_DB"
echo "   To   : $PG_URL"
echo ""

python3 << PYEOF
import sqlite3, json, sys, os
import urllib.request, urllib.parse

sqlite_path = "$SQLITE_DB"
pg_url      = "$PG_URL"

# Parse pg_url for psycopg2-style or use subprocess psql
# We'll dump SQL and pipe via psql for simplicity (no extra Python deps needed)

conn = sqlite3.connect(sqlite_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def esc(v):
    """Escape value for PostgreSQL COPY-style insert."""
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

lines = []

lines.append("BEGIN;")
lines.append("-- Departments")
for row in cur.execute("SELECT id, name, created_at FROM departments"):
    lines.append(
        f"INSERT INTO departments (id, name, created_at) VALUES "
        f"({esc(row['id'])}, {esc(row['name'])}, {esc(row['created_at'])}) "
        f"ON CONFLICT (id) DO NOTHING;"
    )

lines.append("-- Users")
for row in cur.execute("SELECT id, email, created_at, role, department_id FROM users"):
    lines.append(
        f"INSERT INTO users (id, email, created_at, role, department_id) VALUES "
        f"({esc(row['id'])}, {esc(row['email'])}, {esc(row['created_at'])}, "
        f"{esc(row['role'])}, {esc(row['department_id'])}) "
        f"ON CONFLICT (id) DO NOTHING;"
    )

lines.append("-- Sessions")
for row in cur.execute(
    "SELECT id, machine_id, project_path, model, status, started_at, ended_at, "
    "user_id, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens FROM sessions"
):
    lines.append(
        f"INSERT INTO sessions (id, machine_id, project_path, model, status, started_at, ended_at, "
        f"user_id, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens) VALUES "
        f"({esc(row['id'])}, {esc(row['machine_id'])}, {esc(row['project_path'])}, "
        f"{esc(row['model'])}, {esc(row['status'])}, {esc(row['started_at'])}, "
        f"{esc(row['ended_at'])}, {esc(row['user_id'])}, "
        f"{esc(row['input_tokens'])}, {esc(row['output_tokens'])}, "
        f"{esc(row['cache_creation_tokens'])}, {esc(row['cache_read_tokens'])}) "
        f"ON CONFLICT (id) DO NOTHING;"
    )

lines.append("-- Events")
event_count = 0
for row in cur.execute(
    "SELECT id, session_id, event_type, timestamp, entry_uuid, user_prompt, "
    "tool_name, tool_input, tool_output, tool_duration_ms, assistant_message, "
    "input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens FROM events "
    "ORDER BY id"
):
    lines.append(
        f"INSERT INTO events (id, session_id, event_type, timestamp, entry_uuid, "
        f"user_prompt, tool_name, tool_input, tool_output, tool_duration_ms, "
        f"assistant_message, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens) VALUES "
        f"({esc(row['id'])}, {esc(row['session_id'])}, {esc(row['event_type'])}, "
        f"{esc(row['timestamp'])}, {esc(row['entry_uuid'])}, {esc(row['user_prompt'])}, "
        f"{esc(row['tool_name'])}, {esc(row['tool_input'])}, {esc(row['tool_output'])}, "
        f"{esc(row['tool_duration_ms'])}, {esc(row['assistant_message'])}, "
        f"{esc(row['input_tokens'])}, {esc(row['output_tokens'])}, "
        f"{esc(row['cache_creation_tokens'])}, {esc(row['cache_read_tokens'])}) "
        f"ON CONFLICT DO NOTHING;"
    )
    event_count += 1

# Reset PostgreSQL sequence for events.id to max(id)+1
lines.append("SELECT setval('events_id_seq', COALESCE((SELECT MAX(id) FROM events), 0) + 1, false);")
lines.append("COMMIT;")

print(f"  Rows: {event_count} events")
sql = "\n".join(lines)
with open("/tmp/sqlite_migration.sql", "w") as f:
    f.write(sql)
print("  SQL written to /tmp/sqlite_migration.sql")
PYEOF

echo ""
echo "▶ Applying to PostgreSQL..."
psql "$PG_URL" -f /tmp/sqlite_migration.sql -v ON_ERROR_STOP=1 2>&1 | tail -5

echo ""
echo "✅ Migration complete. Verify with:"
echo "   psql \"$PG_URL\" -c 'SELECT COUNT(*) FROM events;'"
echo ""
echo "⚠️  Keep the SQLite backup at $SQLITE_DB until you verify data is correct."
