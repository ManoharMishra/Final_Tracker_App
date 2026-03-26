import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  createDecisionSchema,
  getDecisionsSchema,
} from "@/lib/validations/decision.validation";
import { createDecision, getDecisions } from "@/services/decision.service";
import { structuredLog } from "@/lib/logging";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    structuredLog("API", "HIT", {
      endpoint: "/api/decisions",
      user_id: actorId,
      org_id,
      method: "POST",
    });

    const parsed = createDecisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const decision = await createDecision(parsed.data, actorId);

    return Response.json({ data: decision }, { status: 201 });
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
      endpoint: "/api/decisions",
      user_id: actorId,
      org_id,
      method: "GET",
    });

    const parsed = getDecisionsSchema.safeParse(params);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await getDecisions(parsed.data, actorId);

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
