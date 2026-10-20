import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./jobs/scheduler.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});

const stopScheduler = startScheduler();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  stopScheduler();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
