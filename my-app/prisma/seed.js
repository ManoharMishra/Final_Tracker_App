require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "my-org" },
    update: { name: "My Org" },
    create: {
      name: "My Org",
      slug: "my-org",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "test@test.com" },
    update: {
      name: "Manohar",
      org_id: organization.id,
    },
    create: {
      email: "test@test.com",
      name: "Manohar",
      org_id: organization.id,
    },
  });

  // Ensure the seeded user can access member/invite management APIs.
  await prisma.membership.upsert({
    where: {
      userId_orgId: {
        userId: user.id,
        orgId: organization.id,
      },
    },
    update: {
      role: "OWNER",
    },
    create: {
      userId: user.id,
      orgId: organization.id,
      role: "OWNER",
    },
  });

  console.log("ORG_ID:", organization.id);
  console.log("USER_ID:", user.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
