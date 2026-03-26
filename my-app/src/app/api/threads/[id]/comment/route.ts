import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { validateThreadAccess } from "@/lib/validate";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const { id } = await context.params;
    const parsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid thread ID", parsed.error.issues);
    }

    const body = await request.json().catch(() => ({}));
    const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
    if (!comment) {
      throw new ApiError("BAD_REQUEST", "comment is required");
    }

    const data = await prisma.$transaction(async (tx) => {
      await validateThreadAccess(tx, actorId, parsed.data.threadId, { forUpdate: true });

      await tx.$executeRaw`
        INSERT INTO thread_activities (id, "threadId", type, "userId", metadata, "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${parsed.data.threadId}::uuid,
          'COMMENT'::"ActivityType",
          ${actorId}::uuid,
          ${JSON.stringify({ comment: comment.slice(0, 300) })}::jsonb,
          now()
        )
      `;

      const statsRows = await tx.$queryRaw<Array<{
        id: string;
        reactionsCount: number;
        commentsCount: number;
        conversionCount: number;
      }>>`
        INSERT INTO thread_stats (id, "threadId", "reactionsCount", "commentsCount", "conversionCount")
        VALUES (gen_random_uuid()::text, ${parsed.data.threadId}::uuid, 0, 1, 0)
        ON CONFLICT ("threadId")
        DO UPDATE SET "commentsCount" = thread_stats."commentsCount" + 1
        RETURNING id, "reactionsCount", "commentsCount", "conversionCount"
      `;

      return { comment, stats: statsRows[0] ?? null };
    });

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
