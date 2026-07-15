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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

// Pre-computed bcrypt cost 10 hash for the demo password "password123".
// Generated with golang.org/x/crypto/bcrypt (matches the Go backend).
const DEMO_PASSWORD_HASH =
  "$2a$10$Fbuiz9jRNBBABRRIBu5DkeeC5A8uvucXoAf0dAaNy59glKeQnwo.u";

async function main() {
  const alice = await prisma.user.upsert({
    where: { username: "alice" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      username: "alice",
      passwordHash: DEMO_PASSWORD_HASH,
      displayName: "Alice",
    },
  });
  const bob = await prisma.user.upsert({
    where: { username: "bob" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      username: "bob",
      passwordHash: DEMO_PASSWORD_HASH,
      displayName: "Bob",
    },
  });
  const charlie = await prisma.user.upsert({
    where: { username: "charlie" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      username: "charlie",
      passwordHash: DEMO_PASSWORD_HASH,
      displayName: "Charlie",
    },
  });

  const team = await prisma.team.upsert({
    where: { slug: slugify("Acme") },
    update: {},
    create: {
      name: "Acme",
      slug: slugify("Acme"),
      ownerId: alice.id,
    },
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: alice.id } },
    update: { role: "owner" },
    create: { teamId: team.id, userId: alice.id, role: "owner" },
  });
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: bob.id } },
    update: {},
    create: { teamId: team.id, userId: bob.id, role: "member" },
  });

  const existingInvite = await prisma.teamInvitation.findFirst({
    where: { teamId: team.id, inviteeUsername: "charlie", status: "pending" },
  });
  if (!existingInvite) {
    await prisma.teamInvitation.create({
      data: {
        teamId: team.id,
        inviterId: alice.id,
        inviteeUsername: charlie.username,
        status: "pending",
      },
    });
  }

  const taskCount = await prisma.task.count({ where: { teamId: team.id } });
  if (taskCount === 0) {
    await prisma.task.createMany({
      data: [
        {
          teamId: team.id,
          title: "Ship PRD-02 spec",
          description: "Auth + teams doc is in the bag.",
          status: "done",
          priority: "high",
        },
        {
          teamId: team.id,
          title: "Wire up invite flow",
          description: "Send + accept + reject invitations.",
          status: "in_progress",
          priority: "high",
        },
        {
          teamId: team.id,
          title: "Polish team dashboard",
          status: "todo",
          priority: "medium",
        },
      ],
    });
  }

  console.log(
    `Seeded users [alice, bob, charlie] (password: password123), team "Acme" with bob as member and charlie invited.`,
  );
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