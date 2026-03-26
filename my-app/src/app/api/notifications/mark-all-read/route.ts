import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { markAllRead } from "@/services/notification.service";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const data = await markAllRead(session.userId);
    return Response.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
