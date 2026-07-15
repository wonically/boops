import { PrismaClient } from "@prisma/client";

/**
 * Node-only Prisma client. Never import this from middleware / Edge.
 * DATABASE_URL must be set in env (see client/.env.local).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
