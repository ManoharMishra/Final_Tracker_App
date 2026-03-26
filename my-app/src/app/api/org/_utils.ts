import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

type MembershipRow = {
  id: string;
  userId: string;
  orgId: string;
  role: OrgRole;
  joinedAt: Date;
};

export async function getActorContext(actorId: string): Promise<{ orgId: string; role: OrgRole }> {
  if (!actorId) {
    throw new ApiError("FORBIDDEN", "x-user-id header is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, org_id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "User not found");
  }

  // Backfill membership for legacy users and heal legacy role edge cases.
  const membership = await prisma.$transaction(async (tx) => {
    const existingRows = await tx.$queryRaw<MembershipRow[]>`
      SELECT id, "userId", "orgId", role, "joinedAt"
      FROM memberships
      WHERE "userId" = ${actorId}::uuid
        AND "orgId" = ${user.org_id}::uuid
      LIMIT 1
    `;

    let membership = existingRows[0];

    if (!membership) {
      const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM memberships
        WHERE "orgId" = ${user.org_id}::uuid
      `;
      const countValue = countRows[0]?.count;
      const orgMembershipCount = countValue == null ? 0 : Number(countValue);

      const createdRows = await tx.$queryRaw<MembershipRow[]>`
        INSERT INTO memberships (id, "userId", "orgId", role, "joinedAt")
        VALUES (${randomUUID()}, ${actorId}::uuid, ${user.org_id}::uuid, ${orgMembershipCount === 0 ? "OWNER" : "MEMBER"}::"Role", now())
        RETURNING id, "userId", "orgId", role, "joinedAt"
      `;

      membership = createdRows[0];
    }

    // Edge-case auto-heal:
    // If org has exactly one member and no OWNER, promote that sole member to OWNER.
    if (membership.role === "MEMBER") {
      const ownerCountRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM memberships
        WHERE "orgId" = ${user.org_id}::uuid
          AND role = 'OWNER'
      `;
      const totalCountRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM memberships
        WHERE "orgId" = ${user.org_id}::uuid
      `;

      const ownerCountValue = ownerCountRows[0]?.count;
      const totalCountValue = totalCountRows[0]?.count;
      const ownerCount = ownerCountValue == null ? 0 : Number(ownerCountValue);
      const totalCount = totalCountValue == null ? 0 : Number(totalCountValue);

      if (ownerCount === 0 && totalCount === 1) {
        const promotedRows = await tx.$queryRaw<MembershipRow[]>`
          UPDATE memberships
          SET role = 'OWNER'::"Role"
          WHERE id = ${membership.id}
          RETURNING id, "userId", "orgId", role, "joinedAt"
        `;
        membership = promotedRows[0] ?? membership;
      }
    }

    return membership;
  });

  return { orgId: user.org_id, role: membership.role };
}

export function assertManagerRole(role: OrgRole): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new ApiError("FORBIDDEN", "Only OWNER or ADMIN can manage members");
  }
}

export async function getMembershipByUserId(orgId: string, userId: string): Promise<MembershipRow> {
  const rows = await prisma.$queryRaw<MembershipRow[]>`
    SELECT id, "userId", "orgId", role, "joinedAt"
    FROM memberships
    WHERE "orgId" = ${orgId}::uuid
      AND "userId" = ${userId}::uuid
    LIMIT 1
  `;

  const membership = rows[0];
  if (!membership) {
    throw new ApiError("NOT_FOUND", "Member not found in this organization");
  }

  return membership;
}

export async function getMembershipById(orgId: string, membershipId: string): Promise<MembershipRow> {
  const rows = await prisma.$queryRaw<MembershipRow[]>`
    SELECT id, "userId", "orgId", role, "joinedAt"
    FROM memberships
    WHERE "orgId" = ${orgId}::uuid
      AND id = ${membershipId}
    LIMIT 1
  `;

  const membership = rows[0];
  if (!membership) {
    throw new ApiError("NOT_FOUND", "Member not found in this organization");
  }

  return membership;
}

export async function getOwnerCount(orgId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM memberships
    WHERE "orgId" = ${orgId}::uuid
      AND role = 'OWNER'
  `;

  const value = rows[0]?.count;
  return value == null ? 0 : Number(value);
}
