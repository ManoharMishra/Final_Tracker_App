import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { acceptInvite } from "@/lib/services/invite.service";

const acceptInviteSchema = z
  .object({
    token: z.string().trim().min(1, "token is required"),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const body = await request.json();
    const parsed = acceptInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", "User not found");
    }

    const result = await acceptInvite(parsed.data.token, actorId);

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
