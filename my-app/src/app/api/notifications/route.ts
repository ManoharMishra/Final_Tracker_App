import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { getNotifications } from "@/services/notification.service";

const booleanFromQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}, z.boolean().optional());

const getNotificationsSchema = z.object({
  is_read: booleanFromQuerySchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);

    const { searchParams } = new URL(request.url);
    const parsed = getNotificationsSchema.safeParse({
      is_read: searchParams.get("is_read") ?? undefined,
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    });

    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await getNotifications({
      ...parsed.data,
      user_id: session.userId,
    });
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
