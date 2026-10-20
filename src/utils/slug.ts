import { randomBytes } from "node:crypto";

/** "Clean water in every school!" → "clean-water-in-every-school-4f2a" */
export function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 50)
    .replace(/-+$/, "");
  return `${base || "campaign"}-${randomBytes(2).toString("hex")}`;
}
