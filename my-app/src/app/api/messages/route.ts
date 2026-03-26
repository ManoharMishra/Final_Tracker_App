import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  logMembershipSafeMode,
  logThreadOrgLinkageSafeMode,
} from "@/lib/auth/membership-safe";
import {
  createMessageSchema,
  getMessagesSchema,
} from "@/lib/validations/message.validation";
import { createMessage, getMessages } from "@/services/message.service";
import { structuredLog } from "@/lib/logging";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    structuredLog("API", "HIT", {
      endpoint: "/api/messages",
      user_id: actorId,
      org_id,
      method: "POST",
    });

    await logMembershipSafeMode({
      route: "/api/messages POST",
      user_id: actorId,
      org_id,
    });

    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const message = await createMessage(parsed.data, actorId);

    await logThreadOrgLinkageSafeMode({
      route: "/api/messages POST",
      thread_id: parsed.data.thread_id,
      org_id,
    });

    return Response.json({ success: true, data: message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const { searchParams } = new URL(request.url);

    const params = {
      thread_id: searchParams.get("thread_id") ?? "",
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    };

    structuredLog("API", "HIT", {
      endpoint: "/api/messages",
      user_id: actorId,
      org_id,
      method: "GET",
    });

    await logMembershipSafeMode({
      route: "/api/messages GET",
      user_id: actorId,
      org_id,
    });

    if (params.thread_id) {
      await logThreadOrgLinkageSafeMode({
        route: "/api/messages GET",
        thread_id: params.thread_id,
        org_id,
      });
    }

    const parsed = getMessagesSchema.safeParse(params);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await getMessages(parsed.data, actorId);

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
