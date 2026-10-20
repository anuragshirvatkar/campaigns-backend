// One-off: point existing demo campaigns' example.org links at the API's demo documents.
// Safe to run more than once. Usage: node dist/scripts/demo-links.js
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const OLD = "https://example.org/";
const NEW = `${env.PUBLIC_URL}/api/demo-docs/`;

async function main() {
  const campaigns = await prisma.campaign.findMany({ select: { id: true, sources: true, storyBlocks: true } });
  let changed = 0;
  for (const c of campaigns) {
    const sources = JSON.stringify(c.sources ?? null);
    const blocks = JSON.stringify(c.storyBlocks ?? null);
    if (!sources.includes(OLD) && !blocks.includes(OLD)) continue;
    await prisma.campaign.update({
      where: { id: c.id },
      data: { sources: JSON.parse(sources.split(OLD).join(NEW)), storyBlocks: JSON.parse(blocks.split(OLD).join(NEW)) },
    });
    changed++;
  }
  console.log(`Updated links in ${changed} campaign(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
