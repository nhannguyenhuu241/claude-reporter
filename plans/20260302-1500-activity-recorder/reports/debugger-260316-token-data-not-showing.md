# Token Data Not Showing in Dashboard — Debug Report

**Date:** 2026-03-16
**Scope:** `/web` directory — hook script → API ingest → DB → dashboard

---

## Executive Summary

The token data pipeline is **structurally correct** end-to-end. Field names match, DB schema has the right columns, and the server-side aggregation logic is sound. However there are **three distinct failure modes** that explain why tokens show as zero in practice:

1. **`PostToolUse` hook payload does NOT carry `usage` data** — Claude Code does not inject usage into PostToolUse hook payloads by default. Tokens are only available in the transcript JSONL.
2. **Silent `usage`-less Stop events** — The Stop hook payload itself carries no usage. The script reads the transcript to emit assistant-message events, but only emits usage if `usage` is non-empty in the transcript entry. If Claude omits the `usage` object (e.g., on tool-only turns), no tokens are recorded.
3. **Deduplication blocks re-accumulation** — When the same transcript entry is replayed (idempotent), `createEventIdempotent` returns `null`, which correctly skips the token increment. However if `State` tracking advances the `last_uuid` pointer *past* entries before they are flushed, those entries are silently lost.

---

## Detailed Findings

### 1. reporter.sh — Token Extraction (hook script)

**File:** `web/hooks/reporter.sh` (identical to `web/public/hooks/reporter.sh`)

**How tokens flow:**

- Lines 33–213: A Python3 inline script processes each hook payload.
- For `Stop` events (line 57), it reads the transcript JSONL line-by-line.
- For each `assistant` entry found after `last_uuid`, it reads `msg.get("usage", {})` (line 97).
- Only if `usage` is non-empty does it attach the `usage` dict to the event (lines 118–124):

```python
if usage:
    ev["usage"] = {
        "input_tokens":                usage.get("input_tokens", 0),
        "output_tokens":               usage.get("output_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "cache_read_input_tokens":     usage.get("cache_read_input_tokens", 0),
    }
```

**Bug A — `PostToolUse` events carry no usage in hook payload:**

The hook script handles `PostToolUse` at the outer level but the Python enrichment block only extracts usage from the transcript for `Stop` events. There is no code in `reporter.sh` that reads usage from the `PostToolUse` hook payload (Claude Code does not include token data in PreToolUse/PostToolUse hook payloads).

**Bug B — `usage` guard requires non-empty dict, not individual fields:**

If the Claude transcript entry has `"usage": {}` (empty dict), the guard `if usage:` evaluates to `False` (empty dict is falsy in Python). This correctly skips, but it also means any transcript entry where usage fields are present but happen to be zero integers — e.g., `{"input_tokens": 0, "output_tokens": 0}` — correctly attaches the object, so this is not a bug per se.

**Bug C — assistant messages with no text block are silently skipped:**

Lines 104–105: `if full_text:` — if an assistant turn is tool-only (no text content blocks), it is excluded from `new_messages`, and its usage is never emitted. This is a real gap: tool-heavy sessions produce many assistant turns with tokens but no text, so all their token counts are dropped.

```python
full_text = "\n".join(text_parts)
if full_text:        # ← skips tool-only assistant turns
    ev = { ... }
    if usage:
        ev["usage"] = { ... }
```

---

### 2. processEvent.ts — Server-Side Token Accumulation

**File:** `web/src/lib/processEvent.ts`

**`Stop` case (lines 101–141):**

```typescript
const usage = body.usage as Record<string, number> | undefined;
// ...
if (event && usage) {
  await tx.session.update({
    where: { id: sessionId },
    data: {
      inputTokens: { increment: usage.input_tokens ?? 0 },
      outputTokens: { increment: usage.output_tokens ?? 0 },
      cacheCreationTokens: { increment: usage.cache_creation_input_tokens ?? 0 },
      cacheReadTokens: { increment: usage.cache_read_input_tokens ?? 0 },
    },
  });
}
```

Field names match exactly what `reporter.sh` sends. No mismatch here.

**`PostToolUse` case (lines 35–79):**

```typescript
const usage = body.usage as Record<string, number> | null;
// ...
if (event && usage) {
  await tx.session.update({ ... increment tokens ... });
}
```

This code is correct, but it only fires if `body.usage` is present. Since `reporter.sh` never attaches `usage` to PostToolUse events (Claude Code hook payloads don't include it), this path is never exercised.

**Deduplication interaction (lines 170–187):**

`createEventIdempotent` returns `null` on P2002 (duplicate `(sessionId, entryUuid)`). The outer `if (event && usage)` check then skips the token increment. This is correct behavior — prevents double-counting on replay. But if events arrive partially (e.g., session flush hits the 90-second interval mid-session), some messages may be queued with a `last_uuid` already advanced past them, and they are never re-emitted.

---

### 3. Schema — Field Names

**File:** `web/prisma/schema.prisma` (lines 51–54)

```prisma
inputTokens         Int @default(0) @map("input_tokens")
outputTokens        Int @default(0) @map("output_tokens")
cacheCreationTokens Int @default(0) @map("cache_creation_tokens")
cacheReadTokens     Int @default(0) @map("cache_read_tokens")
```

Prisma JS field names: `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`.
Hook payload field names inside `usage` object: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.

Server reads them as: `usage.input_tokens`, `usage.output_tokens`, `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens` — matches exactly what the hook sends. **No mismatch.**

---

### 4. API Endpoints — Token Queries

**`/api/stats` (`web/src/app/api/stats/route.ts` lines 22–30):**

Aggregates `_sum` of `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens` from `Session` model. Correct.

**`/api/report` (`web/src/app/api/report/route.ts` lines 75–78):**

Reads session-level token fields directly (`s.inputTokens`, etc.) and accumulates per project. Correct.

**`/api/report/team` (`web/src/app/api/report/team/route.ts` lines 114–117):**

Accumulates from session rows into member totals. Correct.

All three API endpoints read from `Session` aggregated columns, which are only updated when `processEvent.ts` fires the `session.update` increment. If tokens never reach `processEvent.ts` with a non-null `usage`, the columns stay at 0.

---

## Root Cause Summary

| # | Root Cause | File : Line | Impact |
|---|-----------|-------------|--------|
| **RC-1** | Tool-only assistant turns (no text content) silently skip usage extraction | `reporter.sh:104-105` | All tool-heavy sessions have zero tokens |
| **RC-2** | `PostToolUse` hook payload never carries usage data from Claude Code | `reporter.sh` (by design of Claude Code API) | No tokens from PostToolUse path |
| **RC-3** | If `state_dir` is unavailable or empty, `last_uuid` defaults to `""`, causing full-transcript replay — but only on first run; stale state can miss entries | `reporter.sh:63-68` | Some sessions show partial tokens |

**RC-1 is the primary bug.** In typical Claude Code usage, most assistant turns that carry token data are tool-result turns (the assistant calls a tool; the response entry has usage but no visible text). These are dropped because of the `if full_text:` guard.

---

## Recommendations

### Fix RC-1 (High Priority)

In `reporter.sh` (both `web/hooks/reporter.sh` and `web/public/hooks/reporter.sh`), change the assistant message extraction to emit a usage-only event even when `full_text` is empty:

Current logic (lines 104–126):
```python
full_text = "\n".join(text_parts)
if full_text:
    ev = { ... "message": full_text ... }
    if usage:
        ev["usage"] = { ... }
    new_messages.append(ev)
    latest_uuid = entry_uuid or latest_uuid
```

Proposed logic:
```python
full_text = "\n".join(text_parts)
if full_text or usage:          # emit even for tool-only turns that carry usage
    ev = {
        "hook_event_name":  "Stop",
        "session_id":       session_id,
        "cwd":              cwd,
        "user_uuid":        user_uuid,
        "message":          full_text[:8000],   # may be empty string
        "entry_uuid":       entry_uuid,
        "event_timestamp":  ts,
    }
    if usage:
        ev["usage"] = { ... }
    new_messages.append(ev)
    latest_uuid = entry_uuid or latest_uuid
```

Same fix needed in both the primary block (lines 104–126) and the stale-UUID fallback block (lines 170–189).

### Fix RC-2 (Low — by design)

No change needed; Claude Code does not expose per-tool usage in hook payloads. The transcript-reading approach is the correct workaround.

### Verify DB State (Immediate)

Run against the production DB to confirm tokens are zero:

```sql
SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(cache_creation_tokens), SUM(cache_read_tokens)
FROM sessions
WHERE started_at > NOW() - INTERVAL '7 days';
```

If all zeros, RC-1 is confirmed as the cause.

### Add Debug Logging (Optional)

In `processEvent.ts` Stop case, add a log when `usage` is present vs absent to confirm the server side is receiving token data once the hook fix is deployed.

---

## Unresolved Questions

1. Does Claude Code's transcript JSONL actually include `usage` on tool-only assistant turns, or only on turns that also produce text? If usage is absent from the transcript itself, RC-1 fix does nothing and the data simply does not exist upstream.
2. Are there sessions in the DB that have `input_tokens > 0`? If yes, the pipeline works for text-heavy sessions and RC-1 is confirmed. If no sessions ever have tokens, there may be a delivery failure (rate limit, 403 from invalid UUID, etc.) happening before `processEvent.ts` is reached.
3. The `state_dir` is passed as `sys.argv[2]` but the transcript-processing block at line 62 requires `state_dir` to be non-empty (`if transcript_path and session_id and state_dir:`). If the variable is empty, the entire transcript processing is skipped. Verify `$STATE_DIR` is always set correctly on user machines.
