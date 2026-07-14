import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  await prisma.task.createMany({
    data: [
      {
        title: "Set up monorepo",
        description: "Scaffold the pnpm workspace with backend, db, and frontend packages.",
        status: "done",
        priority: "high",
      },
      {
        title: "Implement task API",
        description: "Build CRUD endpoints in Go with Gin and PostgreSQL.",
        status: "in_progress",
        priority: "high",
      },
      {
        title: "Build task UI",
        description: "Next.js task list with create, toggle, and delete.",
        status: "todo",
        priority: "medium",
      },
    ],
    skipDuplicates: true,
  });
  console.log("Seeded tasks");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
