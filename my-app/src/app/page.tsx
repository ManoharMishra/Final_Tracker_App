import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getServerSession();

  if (session) {
    redirect("/dashboard");
  }

  const orgCount = await prisma.organization.count();
  redirect(orgCount === 0 ? "/setup" : "/login");
}
