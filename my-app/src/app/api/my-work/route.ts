import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import {
  getMyMentions,
  getMyNotifications,
  getMyTasks,
} from "@/services/mywork.service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);

    const [tasks, mentions, notifications] = await Promise.all([
      getMyTasks(session.userId),
      getMyMentions(session.userId),
      getMyNotifications(session.userId),
    ]);

    return Response.json({ tasks, mentions, notifications });
  } catch (error) {
    return handleApiError(error);
  }
}
