import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { created_at: "asc" },
      take: 2,
    });

    if (orgs.length !== 1) {
      throw new ApiError(
        "BAD_REQUEST",
        "Single-organization mode requires exactly one organization"
      );
    }

    return Response.json({
      data: {
        orgCount: 1,
        organization: orgs[0],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
