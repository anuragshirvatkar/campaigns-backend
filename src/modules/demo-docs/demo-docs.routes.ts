import { Router } from "express";
import { DEMO_DOCS, type DemoDoc } from "./demo-docs.content.js";

/** /demo-docs/:slug — simple web pages that the seeded campaigns link to. */
export const demoDocsRouter = Router();

demoDocsRouter.get("/:slug", (req, res) => {
  const doc = DEMO_DOCS[req.params.slug];
  if (!doc) {
    res.status(404).type("html").send(page("Not found", `<p class="muted">This document doesn't exist.</p>`));
    return;
  }
  res.type("html").send(page(doc.title, render(doc)));
});

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(d: DemoDoc) {
  const sections = d.sections
    .map((s) => {
      const body = s.body ? `<p>${esc(s.body)}</p>` : "";
      const rows = s.rows
        ? `<table>${s.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`
        : "";
      const list = s.list ? `<ul>${s.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
      return `<section><h2>${esc(s.heading)}</h2>${body}${rows}${list}</section>`;
    })
    .join("");
  return `<p class="kind">${esc(d.kind)}</p><h1>${esc(d.title)}</h1><p class="intro">${esc(d.intro)}</p>${sections}`;
}

// Same palette and type as the app: white, navy text, one violet accent
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{margin:0;background:#fff;color:#26264A;font:16px/1.6 -apple-system,Roboto,"Segoe UI",sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 20px 48px}
.demo{background:#FDF3E1;color:#D68A12;font-size:13px;font-weight:600;padding:10px 14px;border-radius:12px;margin-bottom:24px}
.kind{color:#6C5DE8;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px}
h1{font-size:26px;line-height:1.25;margin:0 0 12px}
.intro{color:#7D7E9D;margin:0 0 8px}
h2{font-size:18px;margin:28px 0 8px}
p{margin:0 0 8px}.muted{color:#7D7E9D}
table{width:100%;border-collapse:collapse;border-radius:16px;overflow:hidden;box-shadow:0 6px 16px rgba(75,68,168,.08)}
td{padding:12px 16px;border-top:1px solid #ECEBF5}tr:first-child td{border-top:0}td:last-child{text-align:right;font-weight:600}
ul{padding-left:20px;margin:0}li{margin:6px 0}li::marker{color:#6C5DE8}
</style></head><body><main>
<div class="demo">Demo document · created for this prototype, not a real report</div>
${body}
</main></body></html>`;
}
