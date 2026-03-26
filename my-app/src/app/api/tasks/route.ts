import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  logMembershipSafeMode,
  logTaskOrgLinkageSafeMode,
  logThreadOrgLinkageSafeMode,
} from "@/lib/auth/membership-safe";
import {
  createTaskSchema,
  getTasksSchema,
  updateTaskStatusSchema,
} from "@/lib/validations/task.validation";
import { createTask, getTasks, updateTaskStatus } from "@/services/task.service";
import { structuredLog } from "@/lib/logging";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    structuredLog("API", "HIT", {
      endpoint: "/api/tasks",
      user_id: actorId,
      org_id,
      method: "POST",
    });

    await logMembershipSafeMode({
      route: "/api/tasks POST",
      user_id: actorId,
      org_id,
    });

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const task = await createTask(parsed.data, actorId);

    if (task.thread_id) {
      await logThreadOrgLinkageSafeMode({
        route: "/api/tasks POST",
        thread_id: task.thread_id,
        org_id,
      });
    }

    return Response.json({ data: task }, { status: 201 });
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
      endpoint: "/api/tasks",
      user_id: actorId,
      org_id,
      method: "GET",
    });

    await logMembershipSafeMode({
      route: "/api/tasks GET",
      user_id: actorId,
      org_id,
    });

    if (params.thread_id) {
      await logThreadOrgLinkageSafeMode({
        route: "/api/tasks GET",
        thread_id: params.thread_id,
        org_id,
      });
    }

    const parsed = getTasksSchema.safeParse(params);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await getTasks(parsed.data, actorId);

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    structuredLog("API", "HIT", {
      endpoint: "/api/tasks",
      user_id: actorId,
      org_id,
      method: "PATCH",
    });

    await logMembershipSafeMode({
      route: "/api/tasks PATCH",
      user_id: actorId,
      org_id,
    });

    const parsed = updateTaskStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const updated = await updateTaskStatus(
      parsed.data.task_id,
      parsed.data.status,
      actorId
    );

    await logTaskOrgLinkageSafeMode({
      route: "/api/tasks PATCH",
      task_id: parsed.data.task_id,
      org_id,
    });

    return Response.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
