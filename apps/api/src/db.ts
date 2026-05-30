// Shared Prisma client — single instance per process.
import { PrismaClient } from "@prisma/client";
import { config } from "./config.js";

export const prisma = new PrismaClient({
  log: config().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export type { Prisma } from "@prisma/client";
