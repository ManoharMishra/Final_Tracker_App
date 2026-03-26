// services/threadEvent.service.ts

import { prisma } from "@/lib/prisma";

type TransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EventPayload {
  entity_id: string;
  entity_type:
    | "thread"
    | "message"
    | "task"
    | "decision"
    | "summary"
    | "attachment";
  data: Record<string, unknown>;
}

export interface CreateThreadEventInput {
  threadId: string;
  eventType:
    | "thread_created"
    | "thread_updated"
    | "thread_status_changed"
    | "participant_added"
    | "participant_removed"
    | "message_created"
    | "message_deleted"
    | "task_created"
    | "task_status_changed"
    | "decision_added"
    | "summary_created"
    | "attachment_added";
  actorId: string | null;
  payload: EventPayload;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Creates a ThreadEvent inside an existing Prisma interactive transaction.
 *
 * SR-002: Every write operation that mutates thread state MUST produce
 * a ThreadEvent. Use this inside `prisma.$transaction(async (tx) => { ... })`.
 */
export async function createThreadEventTx(
  tx: TransactionClient,
  input: CreateThreadEventInput
): Promise<void> {
  await tx.threadEvent.create({
    data: {
      thread_id: input.threadId,
      event_type: input.eventType,
      actor_id: input.actorId,
      payload:
        input.payload as unknown as Parameters<typeof tx.threadEvent.create>[0]["data"]["payload"],
    },
  });
}

/**
 * Standalone event creation (outside a transaction).
 * Prefer `createThreadEventTx` when you are already inside a transaction block.
 */
export async function createThreadEvent(
  input: CreateThreadEventInput
): Promise<void> {
  await prisma.threadEvent.create({
    data: {
      thread_id: input.threadId,
      event_type: input.eventType,
      actor_id: input.actorId,
      payload:
        input.payload as unknown as Parameters<typeof prisma.threadEvent.create>[0]["data"]["payload"],
    },
  });
}
