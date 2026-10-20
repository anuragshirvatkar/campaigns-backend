import { PrismaClient } from "@prisma/client";

// One client for the whole process; each new PrismaClient opens its own connection pool.
export const prisma = new PrismaClient({
  // Errors are reported by the error middleware; logging them here too would double up
  log: ["warn"],
});
