import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/socket";
import { dispatchWebhooks } from "@/lib/webhookDispatch";

// Sessions that have been ensured within the current batch — skip redundant DB upserts.
// Passed in from the batch route so a single session only pays the ensureSession cost once
// even when a batch contains dozens of events from the same session.
export async function processEvent(
  body: Record<string, unknown>,
  ensuredSessions?: Set<string>
): Promise<void> {
  const hookEvent = typeof body.hook_event_name === "string" ? body.hook_event_name : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;
  const machineId = typeof body.machine_id === "string" ? body.machine_id : (process.env.MACHINE_ID ?? "unknown");
  const userUuid = typeof body.user_uuid === "string" ? body.user_uuid : null;
  // Optional: original transcript UUID for idempotent replay
  const entryUuid = typeof body.entry_uuid === "string" ? body.entry_uuid : null;
  // Optional: original event timestamp (ISO string) for historical replay
  const rawTs = typeof body.event_timestamp === "string" ? new Date(body.event_timestamp) : null;
  const eventTs = rawTs && !isNaN(rawTs.getTime()) ? rawTs : null;

  if (!sessionId) return;

  // Helper: run ensureSession only if this session hasn't been ensured in this batch yet
  const ensureOnce = async () => {
    if (ensuredSessions?.has(sessionId)) return;
    await ensureSession(sessionId, machineId, body, userUuid);
    ensuredSessions?.add(sessionId);
  };

  switch (hookEvent) {
    case "PreToolUse": {
      await ensureOnce();
      const rawInput = body.tool_input ? JSON.stringify(body.tool_input) : null;
      const event = await createEventIdempotent(prisma, {
        sessionId,
        eventType: "tool_start",
        toolName: (body.tool_name as string) ?? null,
        toolInput: rawInput ? rawInput.slice(0, 50_000) : null,
        entryUuid,
        ...(eventTs && { timestamp: eventTs }),
      });
      // Tool events are not shown in the global live feed → emit to session room only.
      // Clients on the session detail page subscribe to this room via "subscribe" socket event.
      if (event) emitEvent("event", { sessionId, event }, `session:${sessionId}`);
      break;
    }

    case "PostToolUse": {
      await ensureOnce();
      const usage = body.usage as Record<string, number> | null;

      // Wrap event creation + token increment in a transaction so they're atomic.
      // If either step fails, both are rolled back — no orphaned events or skipped counters.
      let event: Awaited<ReturnType<typeof prisma.event.create>> | null = null;
      await prisma.$transaction(async (tx) => {
        const rawIn = body.tool_input ? JSON.stringify(body.tool_input) : null;
        const rawOut = body.tool_output ? JSON.stringify(body.tool_output) : null;
        event = await createEventIdempotent(tx, {
          sessionId,
          eventType: "tool_use",
          toolName: (body.tool_name as string) ?? null,
          toolInput: rawIn ? rawIn.slice(0, 50_000) : null,
          toolOutput: rawOut ? rawOut.slice(0, 100_000) : null,
          toolDurationMs: (body.tool_duration_ms as number) ?? null,
          inputTokens: usage?.input_tokens ?? null,
          outputTokens: usage?.output_tokens ?? null,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
          cacheReadTokens: usage?.cache_read_input_tokens ?? null,
          entryUuid,
          ...(eventTs && { timestamp: eventTs }),
        });
        // Only update token counters when a new (non-duplicate) event was created
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
      });

      if (event) {
        // tool_use: room only (same reason as tool_start — not shown in live feed)
        emitEvent("event", { sessionId, event }, `session:${sessionId}`);
        // session_updated is global — all open dashboards should refresh their stats
        emitEvent("session_updated", { sessionId });
        void dispatchWebhooks("event.tool_use", sessionId, {
          tool_name: (body.tool_name as string) ?? null,
          duration_ms: (body.tool_duration_ms as number) ?? null,
        }, userUuid);
      }
      break;
    }

    case "UserPromptSubmit": {
      await ensureOnce();
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const event = await createEventIdempotent(prisma, {
        sessionId,
        eventType: "user_prompt",
        userPrompt: prompt.slice(0, 10_000),
        entryUuid,
        ...(eventTs && { timestamp: eventTs }),
      });
      if (event) {
        // user_prompt is shown in the global live feed AND session detail → emit both
        // ownerUserId lets clients filter events belonging to other users
        emitEvent("event", { sessionId, event, ownerUserId: userUuid });                          // global live feed
        emitEvent("event", { sessionId, event, ownerUserId: userUuid }, `session:${sessionId}`); // session detail room
        void dispatchWebhooks("event.user_prompt", sessionId, {
          prompt_preview: prompt.slice(0, 200),
        }, userUuid);
      }
      break;
    }

    case "Stop": {
      await ensureOnce();
      const message =
        body.stop_hook_active === true
          ? "[session stopped by hook]"
          : (typeof body.message === "string" ? body.message : "");
      const usage = body.usage as Record<string, number> | undefined;
      // usage_total = sum of ALL turns in the transcript (sent by reporter.sh ≥ v2.2).
      // When present, SET the session counters instead of incrementing — guarantees
      // accuracy even if per-turn events were missed.
      const usageTotal = body.usage_total as Record<string, number> | undefined;

      let event: Awaited<ReturnType<typeof prisma.event.create>> | null = null;
      await prisma.$transaction(async (tx) => {
        event = await createEventIdempotent(tx, {
          sessionId,
          eventType: "assistant_message",
          assistantMessage: message.slice(0, 10_000),
          inputTokens: usage?.input_tokens ?? null,
          outputTokens: usage?.output_tokens ?? null,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
          cacheReadTokens: usage?.cache_read_input_tokens ?? null,
          entryUuid,
          ...(eventTs && { timestamp: eventTs }),
        });
        if (usageTotal) {
          // Authoritative full-transcript total → SET (overwrite)
          await tx.session.update({
            where: { id: sessionId },
            data: {
              inputTokens: usageTotal.input_tokens ?? 0,
              outputTokens: usageTotal.output_tokens ?? 0,
              cacheCreationTokens: usageTotal.cache_creation_input_tokens ?? 0,
              cacheReadTokens: usageTotal.cache_read_input_tokens ?? 0,
            },
          });
        } else if (event && usage) {
          // Fallback for old hook versions: increment per-turn
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
      });
      if (event) {
        // assistant_message is shown in the global live feed AND session detail → emit both
        emitEvent("event", { sessionId, event, ownerUserId: userUuid });                          // global live feed
        emitEvent("event", { sessionId, event, ownerUserId: userUuid }, `session:${sessionId}`); // session detail room
        if (usage) emitEvent("session_updated", { sessionId });
        void dispatchWebhooks("session.ended", sessionId, {
          message: message.slice(0, 500),
          usage: usage ?? null,
          usage_total: usageTotal ?? null,
        }, userUuid);
      }
      break;
    }

    case "Notification": {
      const notifType = (body.type as string) ?? "";
      if (notifType === "session_start" || notifType === "resume_session") {
        await ensureOnce();
        const event = await createEventIdempotent(prisma, {
          sessionId,
          eventType: "session_start",
          entryUuid,
          ...(eventTs && { timestamp: eventTs }),
        });
        if (event) {
          emitEvent("session_started", { sessionId });                           // global — all dashboards
          emitEvent("event", { sessionId, event }, `session:${sessionId}`);      // session detail room
          void dispatchWebhooks("session.created", sessionId, {
            machine_id: machineId,
            project_path: (body.cwd as string) ?? null,
            model: (body.model as string) ?? null,
            started_at: new Date().toISOString(),
          }, userUuid);
        }
      }
      break;
    }

    default:
      break;
  }
}

// ── Idempotent event create ────────────────────────────────────────────────────
// If entryUuid is provided, skip insert when (sessionId, entryUuid) already exists.
// Returns null if the event was a duplicate (skipped), or the created event.
async function createEventIdempotent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma,
  data: Parameters<typeof prisma.event.create>[0]["data"]
): Promise<Awaited<ReturnType<typeof prisma.event.create>> | null> {
  try {
    return await (tx as typeof prisma).event.create({ data });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      // P2002 = Unique constraint violation.
      // The only unique constraint on Event is (sessionId, entryUuid) — used for idempotent replay.
      // Only suppress when Prisma explicitly identifies entryUuid as the violated field.
      // Any other P2002 (unexpected constraint) must propagate so it is not silently lost.
      const meta = (err as { meta?: { target?: string[] } }).meta;
      const target = meta?.target ?? [];
      if (target.includes("entryUuid") || target.includes("entry_uuid")) return null;
    }
    throw err;
  }
}

async function ensureSession(
  sessionId: string,
  machineId: string,
  body: Record<string, unknown>,
  userUuid: string | null
) {
  const cwd = typeof body.cwd === "string" ? body.cwd : null;
  const model = typeof body.model === "string" ? body.model : null;

  let validUserId: string | null = null;
  if (userUuid) {
    const user = await prisma.user.findUnique({
      where: { id: userUuid },
      select: { id: true },
    });
    validUserId = user?.id ?? null;
  }

  // Upsert session. On create: set userId immediately.
  // On update: do NOT touch userId so the first owner is never overwritten.
  // Then claim ownership atomically only if still unowned.
  await prisma.$transaction(async (tx) => {
    await tx.session.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        machineId,
        projectPath: cwd,
        model,
        status: "active",
        userId: validUserId,
      },
      update: {
        ...(cwd && { projectPath: cwd }),
        ...(model && { model }),
        // Intentionally omit userId: never overwrite an existing owner.
      },
    });

    // If this request has a user, link them only if the session is still unclaimed.
    // Both operations are inside the same transaction so there's no window between them.
    if (validUserId) {
      await tx.session.updateMany({
        where: { id: sessionId, userId: null },
        data: { userId: validUserId },
      });
    }
  });

  // Retroactive claim: if the user just sent their UUID for the first time from this
  // machine, backfill any unlinked sessions from the same machineId (last 90 days).
  // This fixes the "next day can't see logs" problem caused by missing UUID file.
  //
  // Safety guard for shared machines: skip retroactive claim if another user
  // already has claimed sessions from this machineId. If two devs share a machine
  // the first one to register would otherwise misattribute the other's sessions.
  if (validUserId && machineId && machineId !== "unknown") {
    const otherUserOnMachine = await prisma.session.findFirst({
      where: { machineId, userId: { not: null, notIn: [validUserId] } },
      select: { id: true },
    });
    if (!otherUserOnMachine) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await prisma.session.updateMany({
        where: { machineId, userId: null, startedAt: { gte: since } },
        data: { userId: validUserId },
      });
    }
  }
}
