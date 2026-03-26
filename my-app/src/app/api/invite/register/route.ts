import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { applySessionCookie, createSessionToken } from "@/lib/auth/session";

const registerSchema = z
  .object({
    token: z.string().trim().min(1, "token is required"),
    name: z.string().trim().min(1, "name is required").max(100),
    email: z.string().trim().email("email must be a valid email address").max(255),
    phone: z.string().trim().max(30).optional(),
  })
  .strict();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    }

    const { token, name, email, phone } = parsed.data;
    const hashedToken = hashToken(token.trim());

    const user = await prisma.$transaction(async (tx) => {
      // Validate invite
      const inviteRows = await tx.$queryRaw<
        Array<{
          id: string;
          orgId: string;
          teamId: string | null;
          role: "OWNER" | "ADMIN" | "MEMBER";
          maxUses: number | null;
          usedCount: number;
          expiresAt: Date | null;
          isActive: boolean;
        }>
      >`
        SELECT
          i.id,
          i."orgId",
          i."teamId",
          i.role,
          i."maxUses",
          i."usedCount",
          i."expiresAt",
          i."isActive"
        FROM invites i
        WHERE i.token = ${hashedToken}
        LIMIT 1
      `;

      const invite = inviteRows[0] ?? null;

      if (!invite) {
        throw new ApiError("NOT_FOUND", "Invite not found or invalid");
      }

      if (!invite.isActive) {
        throw new ApiError("FORBIDDEN", "Invite is inactive");
      }

      if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
        throw new ApiError("FORBIDDEN", "Invite has expired");
      }

      if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
        throw new ApiError("FORBIDDEN", "Invite usage limit reached");
      }

      // Check email not already taken
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing) {
        throw new ApiError("CONFLICT", "An account with this email already exists. Please sign in instead.");
      }

      // Create user assigned to the invite's org
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          org_id: invite.orgId,
          ...(phone ? { phone } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          org_id: true,
        },
      });

      // Create membership with invite role
      await tx.$executeRaw`
        INSERT INTO memberships (id, "userId", "orgId", role, "joinedAt")
        VALUES (
          ${randomUUID()},
          ${newUser.id}::uuid,
          ${invite.orgId}::uuid,
          ${invite.role}::"Role",
          now()
        )
      `;

      if (invite.teamId) {
        await tx.$executeRaw`
          INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
          VALUES (
            ${randomUUID()},
            ${invite.teamId}::uuid,
            ${newUser.id}::uuid,
            now()
          )
        `;
      }

      // Increment invite usage count
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      });

      return newUser;
    });

    // Create session and set cookie
    const { token: sessionToken, session } = await createSessionToken({
      userId: user.id,
      orgId: user.org_id,
    });

    const response = NextResponse.json({ data: user }, { status: 201 });
    applySessionCookie(response, sessionToken, session.expiresAt);

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
