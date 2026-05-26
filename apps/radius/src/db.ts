// Prisma client for the RADIUS server. We connect to the same Postgres
// schema the API uses (single source of truth for users / NAS / etc.),
// but with our own client instance so this process can be scaled, killed,
// or moved without affecting the API.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function disconnect() {
  await prisma.$disconnect();
}
