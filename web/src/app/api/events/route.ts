import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/socket";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hookEvent = (body.hook_event_name as string) ?? "";
  const sessionId = (body.session_id as string) ?? null;
  const machineId = (body.machine_id as string) ?? process.env.MACHINE_ID ?? "unknown";
  const userUuid = (body.user_uuid as string) ?? null;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    switch (hookEvent) {
      case "PreToolUse": {
        await ensureSession(sessionId, machineId, body, userUuid);
        const event = await prisma.event.create({
          data: {
            sessionId,
            eventType: "tool_start",
            toolName: (body.tool_name as string) ?? null,
            toolInput: body.tool_input ? JSON.stringify(body.tool_input) : null,
          },
        });
        emitEvent("event", { sessionId, event });
        break;
      }

      case "PostToolUse": {
        await ensureSession(sessionId, machineId, body, userUuid);
        const usage = body.usage as Record<string, number> | null;

        const event = await prisma.event.create({
          data: {
            sessionId,
            eventType: "tool_use",
            toolName: (body.tool_name as string) ?? null,
            toolInput: body.tool_input ? JSON.stringify(body.tool_input) : null,
            toolOutput: body.tool_output ? JSON.stringify(body.tool_output) : null,
            toolDurationMs: (body.tool_duration_ms as number) ?? null,
            inputTokens: usage?.input_tokens ?? null,
            outputTokens: usage?.output_tokens ?? null,
            cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
            cacheReadTokens: usage?.cache_read_input_tokens ?? null,
          },
        });

        if (usage) {
          await prisma.session.update({
            where: { id: sessionId },
            data: {
              inputTokens: { increment: usage.input_tokens ?? 0 },
              outputTokens: { increment: usage.output_tokens ?? 0 },
              cacheCreationTokens: { increment: usage.cache_creation_input_tokens ?? 0 },
              cacheReadTokens: { increment: usage.cache_read_input_tokens ?? 0 },
            },
          });
        }

        emitEvent("event", { sessionId, event });
        emitEvent("session_updated", { sessionId });
        break;
      }

      case "UserPromptSubmit": {
        await ensureSession(sessionId, machineId, body, userUuid);
        const prompt = (body.prompt as string) ?? "";
        const event = await prisma.event.create({
          data: {
            sessionId,
            eventType: "user_prompt",
            userPrompt: prompt.slice(0, 10_000),
          },
        });
        emitEvent("event", { sessionId, event });
        break;
      }

      case "Stop": {
        await ensureSession(sessionId, machineId, body, userUuid);
        const message =
          (body.stop_hook_active as boolean) === true
            ? "[session stopped by hook]"
            : (body.message as string) ?? "";

        const event = await prisma.event.create({
          data: {
            sessionId,
            eventType: "assistant_message",
            assistantMessage: message.slice(0, 10_000),
          },
        });
        emitEvent("event", { sessionId, event });
        break;
      }

      case "Notification": {
        const notifType = (body.type as string) ?? "";
        if (notifType === "session_start" || notifType === "resume_session") {
          await ensureSession(sessionId, machineId, body, userUuid);
          await prisma.event.create({
            data: { sessionId, eventType: "session_start" },
          });
          emitEvent("session_started", { sessionId });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[events] Error processing hook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function ensureSession(
  sessionId: string,
  machineId: string,
  body: Record<string, unknown>,
  userUuid: string | null
) {
  const cwd = (body.cwd as string) ?? null;
  const model = (body.model as string) ?? null;

  // Validate UUID belongs to a real user
  let validUserId: string | null = null;
  if (userUuid) {
    const user = await prisma.user.findUnique({
      where: { id: userUuid },
      select: { id: true },
    });
    validUserId = user?.id ?? null;
  }

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });

  await prisma.session.upsert({
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
      // Only link user if not already linked (first event wins)
      ...(validUserId && !existing?.userId && { userId: validUserId }),
    },
  });
}
