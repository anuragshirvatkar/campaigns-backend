// Creates the platform admin. There is exactly one, and no API can create or promote one.
//
//   npm run admin:create                      local
//   npm run admin:create -- --reset-password  local, also sets the password back to the default
//   Server: docker compose run --rm api node dist/scripts/create-admin.js [--reset-password]
//
// ADMIN_EMAIL / ADMIN_PASSWORD in the environment override the defaults below.
// Safe to re-run: an existing account is only (re)marked as admin; its password is kept unless asked.
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const EMAIL = (process.env.ADMIN_EMAIL ?? "humanity-admin@gmail.com").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Humanity@123";
const resetPassword = process.argv.includes("--reset-password");

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!existing) {
    await prisma.user.create({ data: { email: EMAIL, passwordHash, fullName: "Humanity Admin", role: "admin" } });
    console.info(`Admin created: ${EMAIL}`);
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "admin", ...(resetPassword ? { passwordHash } : {}) },
    });
    console.info(`Admin ready: ${EMAIL}${resetPassword ? " (password reset)" : ""}`);
  }

  // Only one admin: anyone else marked admin goes back to a normal account
  const { count } = await prisma.user.updateMany({ where: { role: "admin", email: { not: EMAIL } }, data: { role: "user" } });
  if (count) console.info(`Removed admin role from ${count} other account(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
