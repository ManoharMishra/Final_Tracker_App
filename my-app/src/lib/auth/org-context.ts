import { NextRequest } from "next/server";
import { ApiError } from "@/lib/errors";
import { getSessionFromRequest, SESSION_ORG_HEADER } from "@/lib/auth/session";

export async function getOrgContext(request: NextRequest): Promise<string | null> {
  const session = await getSessionFromRequest(request);
  if (session?.orgId) {
    return session.orgId;
  }

  const headerOrg = request.headers.get(SESSION_ORG_HEADER)?.trim() ?? "";
  return headerOrg.length > 0 ? headerOrg : null;
}

export async function requireOrgContext(request: NextRequest): Promise<string> {
  const orgId = await getOrgContext(request);
  if (!orgId) {
    throw new ApiError("BAD_REQUEST", "org_id context is required");
  }

  return orgId;
}