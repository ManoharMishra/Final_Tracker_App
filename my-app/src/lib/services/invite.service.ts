import { randomBytes, randomUUID, createHash } from "crypto";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

type InviteCapableClient = TxClient & {
  invite: {
    findUnique: (args: unknown) => Promise<InviteValidationResult | null>;
    create: (args: unknown) => Promise<{
      id: string;
      orgId: string;
      teamId: string | null;
      role: "OWNER" | "ADMIN" | "MEMBER";
      maxUses: number | null;
      usedCount: number;
      expiresAt: Date | null;
      isActive: boolean;
      createdAt: Date;
    }>;
    update: (args: unknown) => Promise<unknown>;
  };
  membership: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<unknown>;
  };
};

type InviteValidationResult = {
  id: string;
  orgId: string;
  teamId: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  invitedBy: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
};

function generateRawToken(): string {
  return `${randomUUID()}.${randomBytes(24).toString("hex")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertInviteIsUsable(invite: InviteValidationResult): void {
  if (!invite.isActive) {
    throw new ApiError("FORBIDDEN", "Invite is inactive");
  }

  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    throw new ApiError("FORBIDDEN", "Invite has expired");
  }

  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    throw new ApiError("FORBIDDEN", "Invite usage limit reached");
  }
}

async function validateInviteWithClient(
  db: TxClient,
  token: string
): Promise<InviteValidationResult> {
  const dbClient = db as InviteCapableClient;
  const trimmed = token.trim();
  if (!trimmed) {
    throw new ApiError("BAD_REQUEST", "Invite token is required");
  }

  const hashedToken = hashToken(trimmed);

  const invite = await dbClient.invite.findUnique({
    where: { token: hashedToken },
    select: {
      id: true,
      orgId: true,
      teamId: true,
      role: true,
      invitedBy: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!invite) {
    throw new ApiError("NOT_FOUND", "Invite not found");
  }

  assertInviteIsUsable(invite);
  return invite;
}

export async function createInvite(
  orgId: string,
  role: "OWNER" | "ADMIN" | "MEMBER",
  invitedBy: string,
  teamId?: string | null,
  maxUses?: number | null,
  expiresAt?: Date | null
) {
  if (!orgId) {
    throw new ApiError("BAD_REQUEST", "orgId is required");
  }
  if (!invitedBy) {
    throw new ApiError("BAD_REQUEST", "invitedBy is required");
  }
  if (maxUses !== undefined && maxUses !== null && maxUses <= 0) {
    throw new ApiError("BAD_REQUEST", "maxUses must be greater than 0");
  }

  const rawToken = generateRawToken();
  const hashedToken = hashToken(rawToken);

  const invite = await prisma.$transaction(async (tx) => {
    const txClient = tx as unknown as InviteCapableClient;

    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });

    if (!org) {
      throw new ApiError("NOT_FOUND", "Organization not found");
    }

    const inviter = await tx.user.findFirst({
      where: { id: invitedBy, org_id: orgId },
      select: { id: true },
    });

    if (!inviter) {
      throw new ApiError("FORBIDDEN", "Inviter must belong to the organization");
    }

    const inviterMembership = await txClient.membership.findUnique({
      where: {
        userId_orgId: {
          userId: invitedBy,
          orgId,
        },
      },
      select: { id: true },
    });

    if (!inviterMembership) {
      throw new ApiError("FORBIDDEN", "Inviter must be an organization member");
    }

    return txClient.invite.create({
      data: {
        orgId,
        teamId: teamId ?? null,
        role,
        token: hashedToken,
        invitedBy,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ?? null,
        isActive: true,
      },
      select: {
        id: true,
        orgId: true,
        teamId: true,
        role: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });
  });

  return {
    token: rawToken,
    invite,
  };
}

export async function validateInvite(token: string) {
  return validateInviteWithClient(prisma as unknown as InviteCapableClient, token);
}

export async function acceptInvite(token: string, userId: string) {
  if (!userId) {
    throw new ApiError("BAD_REQUEST", "userId is required");
  }

  return prisma.$transaction(async (tx) => {
    const txClient = tx as unknown as InviteCapableClient;
    const invite = await validateInviteWithClient(txClient, token);

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, org_id: true },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", "User not found");
    }

    if (user.org_id !== invite.orgId) {
      throw new ApiError(
        "FORBIDDEN",
        "Invite organization does not match the user's organization"
      );
    }

    const existingMembership = await txClient.membership.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId: invite.orgId,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      throw new ApiError("CONFLICT", "Membership already exists");
    }

    await txClient.membership.create({
      data: {
        userId,
        orgId: invite.orgId,
        role: invite.role,
      },
    });

    if (invite.teamId) {
      const existingTeamRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM team_members
        WHERE "userId" = ${userId}::uuid
        LIMIT 1
      `;

      if (!existingTeamRows[0]) {
        await tx.$executeRaw`
          INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
          VALUES (
            ${randomUUID()},
            ${invite.teamId}::uuid,
            ${userId}::uuid,
            now()
          )
        `;
      }
    }

    await txClient.invite.update({
      where: { id: invite.id },
      data: {
        usedCount: { increment: 1 },
      },
    });

    return {
      success: true,
      orgId: invite.orgId,
      teamId: invite.teamId,
      role: invite.role,
    };
  });
}
