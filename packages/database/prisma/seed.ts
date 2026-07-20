import { prisma } from "../src/index";

async function main() {
  // Production seed intentionally contains no users, stores, migrations, or
  // credentials. Accounts and workspaces are created through registration.
  await prisma.$queryRaw`SELECT 1`;
  console.info("Database connection verified. No seed data was created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
