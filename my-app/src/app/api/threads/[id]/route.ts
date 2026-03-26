// app/api/threads/[id]/route.ts

import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import {
  threadIdParamSchema,
  updateThreadRequestSchema,
} from "@/lib/validations/thread.validation";
import {
  getThreadById,
  updateThread,
  deleteThread,
} from "@/services/thread.service";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/threads/:id ───────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const session = await requireApiSession(request);

    const parsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        parsed.error.issues
      );
    }

    const thread = await getThreadById(parsed.data.threadId, session.userId);

    return Response.json({ success: true, data: thread });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── PATCH /api/threads/:id ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const session = await requireApiSession(request);

    const paramParsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!paramParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        paramParsed.error.issues
      );
    }

    const body = await request.json();
    const parsed = updateThreadRequestSchema.safeParse({
      ...body,
      updated_by: session.userId,
    });
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const updated = await updateThread(
      paramParsed.data.threadId,
      parsed.data
    );

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── DELETE /api/threads/:id ────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const session = await requireApiSession(request);

    const paramParsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!paramParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        paramParsed.error.issues
      );
    }

    await deleteThread(paramParsed.data.threadId, session.userId);

    return Response.json({ success: true, data: null });
  } catch (error) {
    return handleApiError(error);
  }
}
