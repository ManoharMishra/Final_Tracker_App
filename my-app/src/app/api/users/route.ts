import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(100),
    email: z.string().trim().email("email must be a valid email address").max(255),
    phone: z.string().trim().max(30).optional(),
  })
  .strict();

const getUserByEmailSchema = z.object({
  email: z.string().trim().email("email must be a valid email address").max(255),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    // List all users in session org when email lookup is not requested.
    if (!email) {
      const users = await prisma.user.findMany({
        where: { org_id: session.orgId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      return Response.json({ data: users });
    }

    // Look up by email
    const parsed = getUserByEmailSchema.safeParse({ email });

    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues);
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        org_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", "User not found");
    }

    if (session.orgId !== user.org_id) {
      throw new ApiError("FORBIDDEN", "User does not belong to your organization");
    }

    return Response.json({ data: user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    }

    const session = await getSessionFromRequest(request);
    const { name, email, phone } = parsed.data;
    let targetOrgId: string;

    if (session) {
      targetOrgId = session.orgId;
    } else {
      const orgs = await prisma.organization.findMany({
        select: { id: true },
        orderBy: { created_at: "asc" },
        take: 2,
      });

      if (orgs.length !== 1) {
        throw new ApiError(
          "BAD_REQUEST",
          "Single-organization mode requires exactly one organization"
        );
      }

      targetOrgId = orgs[0].id;
    }

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { id: true },
    });

    if (!org) {
      throw new ApiError("NOT_FOUND", `Organization ${targetOrgId} not found`);
    }

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name, email, org_id: targetOrgId, ...(phone ? { phone } : {}) },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          org_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM memberships
        WHERE "orgId" = ${targetOrgId}::uuid
      `;
      const countValue = countRows[0]?.count;
      const orgMembershipCount = countValue == null ? 0 : Number(countValue);

      await tx.$executeRaw`
        INSERT INTO memberships (id, "userId", "orgId", role, "joinedAt")
        VALUES (
          ${randomUUID()},
          ${createdUser.id}::uuid,
          ${targetOrgId}::uuid,
          ${orgMembershipCount === 0 ? "OWNER" : "MEMBER"}::"Role",
          now()
        )
      `;

      return createdUser;
    });

    return Response.json({ data: user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
