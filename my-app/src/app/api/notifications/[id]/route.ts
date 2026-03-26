import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { markNotificationRead } from "@/services/notification.service";

type RouteContext = { params: Promise<{ id: string }> };

const notificationIdSchema = z.string().uuid("notification id must be a valid UUID");

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession(request);

    const { id } = await context.params;
    const idParsed = notificationIdSchema.safeParse(id);

    if (!idParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid notification id",
        idParsed.error.issues
      );
    }

    const data = await markNotificationRead(idParsed.data, session.userId);
    return Response.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
