import { prisma } from "@/lib/prisma";

type PointsTx = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

export type AwardResult = {
  userId: string;
  awarded: number;
  points: number;
  streak: number;
  lastActiveDate: Date | null;
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function diffDaysUTC(from: Date, to: Date): number {
  const fromDay = Date.parse(`${dayKey(from)}T00:00:00.000Z`);
  const toDay = Date.parse(`${dayKey(to)}T00:00:00.000Z`);
  return Math.floor((toDay - fromDay) / 86400000);
}

export async function awardUserPointsTx(
  tx: PointsTx,
  userId: string,
  awarded: number,
  now: Date = new Date()
): Promise<AwardResult> {
  const rows = await tx.$queryRaw<Array<{
    userId: string;
    points: number;
    streak: number;
    lastActiveDate: Date | null;
  }>>`
    SELECT "userId", points, streak, "lastActiveDate"
    FROM user_points
    WHERE "userId" = ${userId}::uuid
    LIMIT 1
  `;

  const existing = rows[0];

  if (!existing) {
    await tx.$executeRaw`
      INSERT INTO user_points ("userId", points, streak, "lastActiveDate")
      VALUES (${userId}::uuid, ${Math.max(0, awarded)}, 1, ${now})
    `;

    return {
      userId,
      awarded,
      points: Math.max(0, awarded),
      streak: 1,
      lastActiveDate: now,
    };
  }

  let nextStreak = existing.streak;
  if (!existing.lastActiveDate) {
    nextStreak = 1;
  } else {
    const days = diffDaysUTC(existing.lastActiveDate, now);
    if (days === 1) {
      nextStreak = existing.streak + 1;
    } else if (days > 1) {
      nextStreak = 1;
    }
  }

  const nextPoints = existing.points + Math.max(0, awarded);

  await tx.$executeRaw`
    UPDATE user_points
    SET points = ${nextPoints},
        streak = ${nextStreak},
        "lastActiveDate" = ${now}
    WHERE "userId" = ${userId}::uuid
  `;

  return {
    userId,
    awarded,
    points: nextPoints,
    streak: nextStreak,
    lastActiveDate: now,
  };
}
