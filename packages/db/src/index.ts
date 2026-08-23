import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  civicOsPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.civicOsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.civicOsPrisma = prisma;
}

export * from "@prisma/client";
