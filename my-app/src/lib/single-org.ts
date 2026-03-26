import { prisma } from "@/lib/prisma";

export async function assertSingleOrgRuntime(): Promise<void> {
  const orgCount = await prisma.organization.count();
  if (orgCount !== 1) {
    throw new Error(
      `Single-organization mode violation: expected exactly 1 organization, found ${orgCount}`
    );
  }
}
