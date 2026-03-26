import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { applySessionCookie, createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getActorContext } from "@/app/api/org/_utils";

const loginSchema = z
  .object({
    email: z.string().trim().email("email must be a valid email address").max(255),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("API HIT:", "/api/auth/login");
    console.log("USER:", null);
    console.log("ORG:", null);

    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        org_id: true,
      },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", "User not found");
    }

    // Ensure org membership exists and run legacy edge-case healing.
    await getActorContext(user.id);

    const { token, session } = await createSessionToken({
      userId: user.id,
      orgId: user.org_id,
    });

    const response = NextResponse.json({ data: user });
    applySessionCookie(response, token, session.expiresAt);

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
