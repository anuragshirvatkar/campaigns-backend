// End-to-end test of every main flow over HTTP. Creates test users and a campaign, so run it
// against a LOCAL database only, with fast timers:
//   terminal 1: DEMO_STEP_SEC=3 SCHEDULER_INTERVAL_SEC=1 npm run dev
//   terminal 2: npm run test:e2e
// Needs the seed (npm run db:seed -- --reset) and the admin (npm run admin:create).
import { readFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:4000/api";
const IMAGE = process.argv[3];
let passed = 0;
const failures = [];

async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ""); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(name, fn, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const v = await fn(); if (v) return v; await sleep(1000); }
  check(name, false, "timed out"); return null;
}

console.log("Public browsing");
let r = await api("GET", "/config");
check("config", r.status === 200 && r.json.fees.platformFeePct === 20 && r.json.categories.length === 10, r.json);
// Seeded campaigns only, so leftovers from earlier test runs don't skew the counts
const seeded = (items) => items.filter((i) => i.isDemo);
r = await api("GET", "/campaigns?limit=50");
check("feed lists the 9 seeded campaigns (draft hidden)", r.status === 200 && seeded(r.json.items).length === 9, r.json);
check("featured campaigns are pinned first", r.json.items.slice(0, 3).every((i) => i.isFeatured), r.json.items.map((i) => i.slug));
check("cards have funding + reach estimate", r.json.items[0]?.funding?.estimatedReachAtGoal?.mid > 0, r.json.items[0]);
r = await api("GET", "/campaigns?sort=most_funded&limit=50");
check("sort most_funded", seeded(r.json.items)[0]?.slug === "river-cleanup", r.json.items.map((i) => i.slug));
r = await api("GET", "/campaigns?sort=ending_soon&limit=50");
check("sort ending_soon only funding, Kochi first", seeded(r.json.items)[0]?.slug === "local-shops" && r.json.items.every((i) => i.status === "funding"), r.json.items.map((i) => i.slug));
r = await api("GET", "/campaigns?q=delhi");
check("search q=delhi", seeded(r.json.items).length === 1 && seeded(r.json.items)[0].slug === "air-sensors", r.json.items.map((i) => i.slug));
r = await api("GET", "/campaigns?category=community");
check("filter category", seeded(r.json.items).length === 1 && seeded(r.json.items)[0].slug === "school-crossing", r.json);
r = await api("GET", "/campaigns?q=zzzz-nothing");
check("no results", r.status === 200 && r.json.items.length === 0);
r = await api("GET", "/campaigns?category=bogus");
check("invalid filter → 400", r.status === 400, r.json);
r = await api("GET", "/campaigns/school-shade-trees");
check("detail by slug", r.status === 200 && r.json.story.blocks.length > 3 && r.json.sources.length === 2, r.json);
check("detail funding 65%", r.json.funding.percentFunded === 65 && r.json.funding.backerCount === 6, r.json.funding);
check("detail anonymous viewer null", r.json.viewer === null);
check("detail timeline", Array.isArray(r.json.timeline) && r.json.timeline.find((s) => s.key === "funding")?.isCurrent);
const waterId = r.json.id;
r = await api("GET", "/campaigns/school-crossing/report");
check("report: completed, spent = budget, measured reach", r.status === 200 && r.json.isFinal && r.json.funds.adSpentCents === r.json.funds.adBudgetCents && r.json.measured.reach > 0 && r.json.series.length === 6, r.json);
r = await api("GET", `/campaigns/${waterId}/comments`);
check("comments thread with reply", r.json.items.length === 2 && r.json.items.some((c) => c.replies.length === 1), r.json);
r = await api("GET", `/campaigns/${waterId}/updates`);
check("updates listed", r.json.items.length === 2);

console.log("Auth");
r = await api("POST", "/auth/login", { body: { email: "demo@campaignone.app", password: "wrong" } });
check("wrong password → 401", r.status === 401);
r = await api("POST", "/auth/login", { body: { email: "DEMO@campaignone.app", password: "Demo@1234" } });
check("demo login (case-insensitive email)", r.status === 200 && r.json.token, r.json);
const demo = r.json.token;
r = await api("GET", "/me", { token: demo });
check("/me with counts", r.status === 200 && r.json.counts.createdCount === 3 && r.json.counts.backedCount === 5, r.json);
r = await api("GET", "/me");
check("/me without token → 401", r.status === 401);
r = await api("GET", "/me/campaigns", { token: demo });
check("my campaigns + tab counts (incl. one sent back by review)", r.json.items.length === 3 && r.json.counts.drafts === 1 && r.json.counts.funding === 1 && r.json.counts.under_review === 1 && r.json.counts.requires_action === 2, r.json.counts);
r = await api("GET", "/me/notifications/unread-count", { token: demo });
check("unread count", r.json.count === 6, r.json);
r = await api("GET", "/me/backed", { token: demo });
check("backed campaigns", r.json.items.length === 5, r.json);
r = await api("GET", `/me/campaigns/${waterId}/analytics`, { token: demo });
check("creator analytics", r.status === 200 && r.json.funding.milestonesReached.join() === "25,50" && r.json.feedback.visuals.total === 4, r.json.funding);

const email = `e2e-${Date.now()}@example.com`;
r = await api("POST", "/auth/signup", { body: { email, password: "short", fullName: "E2E" } });
check("signup weak password → 400", r.status === 400 && r.json.error.details?.password, r.json);
r = await api("POST", "/auth/signup", { body: { email, password: "Test@12345", fullName: "Test Creator" } });
check("signup", r.status === 201 && r.json.token);
const tc = r.json.token;
r = await api("POST", "/auth/signup", { body: { email, password: "Test@12345", fullName: "Dup" } });
check("duplicate signup → 409", r.status === 409);
r = await api("POST", "/auth/signup", { body: { email: `b-${email}`, password: "Test@12345", fullName: "Second Backer" } });
const backer = r.json.token;

console.log("Admin sign-in (admin created by npm run admin:create)");
r = await api("POST", "/auth/login", { body: { email: "humanity-admin@gmail.com", password: "Humanity@123" } });
check("admin can't sign in as a user", r.status === 403 && r.json.error.code === "WRONG_ROLE", r.json);
r = await api("POST", "/auth/login", { body: { email: "humanity-admin@gmail.com", password: "Humanity@123", role: "admin" } });
check("admin signs in with role admin", r.status === 200 && r.json.user.role === "admin", r.json);
const admin = r.json.token;
r = await api("POST", "/auth/login", { body: { email: "demo@campaignone.app", password: "Demo@1234", role: "admin" } });
check("normal user can't sign in as admin", r.status === 403 && r.json.error.code === "WRONG_ROLE", r.json);
r = await api("GET", "/admin/campaigns", { token: tc });
check("admin API is admin-only", r.status === 403, r.json);
r = await api("GET", "/admin/campaigns?tab=pending", { token: admin });
check("review queue lists seeded pending campaigns with AI suggestions", r.status === 200 && r.json.items.filter((i) => i.isDemo && i.aiSuggestion).length === 3, r.json.counts);
r = await api("GET", "/admin/analytics?days=30", { token: admin });
check("analytics", r.status === 200 && r.json.daily.length === 30 && r.json.funnel.length === 4 && r.json.kpis.raisedCents >= 0 && r.json.delivery.impressions > 0, r.json.kpis);
const approve = (id, body = { decision: "approved" }) => api("POST", `/admin/campaigns/${id}/review`, { token: admin, body });

console.log("Create → submit → admin approves");
r = await api("POST", "/me/campaigns", { token: tc, body: { creationMode: "manual" } });
check("create draft", r.status === 201 && r.json.status === "draft" && r.json.creatorName === "Test Creator", r.json);
const cid = r.json.id;
r = await api("PATCH", `/me/campaigns/${cid}`, { token: tc, body: { title: "x".repeat(61) } });
check("title > 60 → 400", r.status === 400, r.json);
r = await api("PATCH", `/me/campaigns/${cid}`, { token: tc, body: { currentStep: 2, title: "Fix the potholes on FC Road", category: "community", summary: "Potholes cause accidents every monsoon." } });
check("autosave step 1", r.status === 200 && r.json.title === "Fix the potholes on FC Road" && r.json.currentStep === 2);
r = await api("POST", `/me/campaigns/${cid}/submit`, { token: tc });
check("submit incomplete → 422 with step issues", r.status === 422 && r.json.error.details.some((i) => i.step === 2) && r.json.error.details.some((i) => i.step === 5), r.json);
r = await api("PATCH", `/me/campaigns/${cid}`, { token: tc, body: {
  storyBlocks: [{ id: "b1", type: "paragraph", text: "Every monsoon the same potholes return on FC Road, and every year two-wheeler riders are hurt on them. Residents counted every pothole on the stretch and are asking the ward office to resurface it properly before the rains." }, { id: "b2", type: "stat", value: "42", label: "potholes counted", sourceId: "s1" }],
  sources: [{ id: "s1", title: "Ward survey", url: "https://example.org/survey" }],
  reach: { locations: ["Austin"], channels: ["facebook"], interests: [], budgetSplit: {} },
  // Both images are required to submit
  coverImageUrl: "https://example.org/cover.jpg",
  adAssets: [{ id: "a1", type: "image", url: "https://example.org/ad.jpg", width: 1080, height: 1080 }],
  fundingGoalCents: 10000, rulesAccepted: true,
} });
check("autosave rest; single channel → 100%", r.status === 200 && r.json.reach.budgetSplit.facebook === 100 && r.json.readiness.canSubmit, r.json.readiness);
r = await api("POST", `/me/campaigns/${cid}/submit`, { token: tc });
check("submit", r.status === 200 && r.json.status === "submitted" && r.json.slug?.startsWith("fix-the-potholes"), r.json);
r = await api("GET", `/campaigns/${cid}`);
check("submitted campaign hidden from public", r.status === 404);
r = await api("GET", `/campaigns/${cid}`, { token: tc });
check("owner can preview own submitted campaign", r.status === 200);
await waitFor("AI pre-screen stored for the admin, status unchanged", async () => {
  const x = await api("GET", `/admin/campaigns/${cid}`, { token: admin });
  return x.json.aiSuggestion && x.json.status === "submitted";
});
r = await approve(cid, { decision: "rejected" });
check("reject needs a reason", r.status === 400, r.json);
r = await approve(cid, { decision: "changes_requested", note: "Add the ward office's reply.", issues: [{ step: 2, message: "Quote the ward office's reply." }] });
check("admin asks for changes", r.status === 200 && r.json.status === "changes_requested" && r.json.reviews[0].reviewer === "admin", r.json.status);
r = await api("GET", `/me/campaigns/${cid}`, { token: tc });
check("creator sees the admin's note and issues", r.json.review.summary === "Add the ward office's reply." && r.json.review.issues[0].step === 2, r.json.review);
r = await api("POST", `/me/campaigns/${cid}/submit`, { token: tc });
check("creator resubmits", r.status === 200 && r.json.status === "submitted", r.json.status);
r = await approve(cid);
check("admin approves", r.status === 200 && r.json.status === "funding", r.json.status);
r = await approve(cid);
check("deciding twice → 409", r.status === 409, r.json);
const live = (await api("GET", `/me/campaigns/${cid}`, { token: tc })).json;
if (live) check("approval sets deadline + published", live.funding.deadline && live.timeline.find((s) => s.key === "approved").at);

console.log("Back the campaign");
r = await api("POST", "/contributions", { token: backer, body: { campaignId: cid, amountCents: 5000, idempotencyKey: "e2e-key-1" } });
check("create pending contribution with fee breakdown", r.status === 201 && r.json.status === "pending" && r.json.breakdown.platformFeeCents === 1000 && r.json.breakdown.processingFeeCents === 145 && r.json.breakdown.totalChargedCents === 5145, r.json);
const k1 = r.json.id;
r = await api("POST", "/contributions", { token: backer, body: { campaignId: cid, amountCents: 5000, idempotencyKey: "e2e-key-1" } });
check("same idempotency key → same contribution", r.json.id === k1);
r = await api("POST", `/contributions/${k1}/confirm`, { token: tc, body: { cardNumber: "4242 4242 4242 4242" } });
check("someone else's contribution → 404", r.status === 404);
r = await api("POST", `/contributions/${k1}/confirm`, { token: backer, body: { cardNumber: "4000 0000 0000 0002" } });
check("declined card → rejected", r.json.status === "rejected" && r.json.failureReason, r.json);
r = await api("POST", "/contributions", { token: backer, body: { campaignId: cid, amountCents: 6000, isPublic: true, idempotencyKey: "e2e-key-2" } });
const k2 = r.json.id;
r = await api("POST", `/contributions/${k2}/confirm`, { token: backer, body: { cardNumber: "4242 4242 4242 4242" } });
check("successful payment", r.json.status === "succeeded" && r.json.paymentRef?.startsWith("demo_pay_") && r.json.campaignFunding.raisedCents === 6000, r.json);
r = await api("POST", `/contributions/${k2}/confirm`, { token: backer, body: { cardNumber: "4242 4242 4242 4242" } });
check("confirming twice doesn't charge twice", r.json.campaignFunding.raisedCents === 6000);
r = await api("GET", `/campaigns/${cid}`, { token: backer });
check("backer auto-follows", r.json.viewer.isFollowing && r.json.viewer.hasBacked, r.json.viewer);
check("public backer listed", r.json.publicBackers.length === 1 && r.json.publicBackers[0].name === "Second B.", r.json.publicBackers);
r = await api("POST", `/me/campaigns/${cid}/cancel`, { token: tc });
check("cancel with backers → 409", r.status === 409);
r = await api("GET", "/me/notifications", { token: tc });
check("creator got milestone 25% + 50%", ["is 25% funded", "is 50% funded"].every((t) => r.json.items.some((n) => n.title.includes(t))), r.json.items.map((n) => n.title));

console.log("Edit live campaign → re-review");
r = await api("PATCH", `/me/campaigns/${cid}`, { token: tc, body: { summary: "Potholes cause accidents every monsoon on FC Road." } });
check("editing live campaign → submitted", r.status === 200 && r.json.status === "submitted", r.json.status);
r = await api("POST", "/contributions", { token: backer, body: { campaignId: cid, amountCents: 5000, idempotencyKey: "e2e-key-3" } });
check("no contributions while under review", r.status === 409 && r.json.error.code === "NOT_ACCEPTING_CONTRIBUTIONS", r.json);
r = await approve(cid, { decision: "rejected", note: "No." });
check("a campaign that was live can't be rejected", r.status === 409 && r.json.error.code === "CANNOT_REJECT_LIVE", r.json);
r = await approve(cid);
check("admin re-approves the edit → funding", r.status === 200 && r.json.status === "funding", r.json.status);

console.log("Fund → prep → promoting → completed");
r = await api("POST", "/contributions", { token: backer, body: { campaignId: cid, amountCents: 4000, idempotencyKey: "e2e-key-4" } });
r = await api("POST", `/contributions/${r.json.id}/confirm`, { token: backer, body: { cardNumber: "4242424242424242" } });
check("goal reached", r.json.campaignFunding.percentFunded === 100);
r = await api("GET", `/me/campaigns/${cid}`, { token: tc });
check("status funded immediately", r.json.status === "funded", r.json.status);
r = await api("PATCH", `/me/campaigns/${cid}`, { token: tc, body: { summary: "late edit" } });
check("funded campaign locked for editing → 409", r.status === 409);
await waitFor("distribution_prep", async () => (await api("GET", `/me/campaigns/${cid}`, { token: tc })).json.status === "distribution_prep");
await waitFor("promoting", async () => (await api("GET", `/me/campaigns/${cid}`, { token: tc })).json.status === "promoting");
await waitFor("completed after budget spent", async () => (await api("GET", `/me/campaigns/${cid}`, { token: tc })).json.status === "completed", 60000);
r = await api("GET", `/campaigns/${cid}/report`);
check("final report: spent == budget 80%", r.json.isFinal && r.json.funds.adBudgetCents === 8000 && r.json.funds.adSpentCents === 8000 && r.json.byChannel.length === 1, r.json.funds);
r = await api("GET", "/me/notifications", { token: backer });
const titles = r.json.items.map((n) => n.title);
check("backer notified: promotion, progress, completed, report", ["now running", "has reached about", "finished its promotion", "final report"].every((t) => titles.some((x) => x.includes(t))), titles);

console.log("Follows, feedback, updates, comments");
r = await api("PUT", `/campaigns/${waterId}/follow`, { token: tc });
check("follow", r.json.isFollowing === true);
r = await api("PUT", `/campaigns/${waterId}/follow`, { token: tc });
check("follow twice is fine", r.status === 200);
r = await api("GET", "/me/follows", { token: tc });
check("/me/follows", r.json.items.some((c) => c.id === waterId));
r = await api("DELETE", `/campaigns/${waterId}/follow`, { token: tc });
check("unfollow", r.json.isFollowing === false);
r = await api("PUT", `/campaigns/${waterId}/feedback`, { token: tc, body: { visualsAnswer: "yes" } });
check("feedback q1", r.json.visualsAnswer === "yes" && r.json.changedMindAnswer === null, r.json);
r = await api("PUT", `/campaigns/${waterId}/feedback`, { token: tc, body: { changedMindAnswer: "somewhat" } });
check("feedback q2 keeps q1", r.json.visualsAnswer === "yes" && r.json.changedMindAnswer === "somewhat", r.json);
r = await api("POST", `/campaigns/${waterId}/updates`, { token: tc, body: { title: "x", body: "y" } });
check("non-owner can't post update → 403", r.status === 403);
r = await api("POST", `/campaigns/${waterId}/updates`, { token: demo, body: { title: "Ward office replied", body: "They will publish the list of tested schools." } });
check("owner posts update", r.status === 201);
r = await api("POST", `/campaigns/${waterId}/comments`, { token: tc, body: { body: "Spam spam spam" } });
check("post comment", r.status === 201);
const spamId = r.json.id;
r = await api("POST", `/campaigns/${waterId}/comments`, { token: backer, body: { body: "reply", parentId: spamId } });
const replyId = r.json.id;
r = await api("POST", `/campaigns/${waterId}/comments`, { token: backer, body: { body: "nested", parentId: replyId } });
check("nested reply → 400", r.status === 400);
for (const t of [demo, backer]) await api("POST", `/comments/${spamId}/report`, { token: t, body: { reason: "spam" } });
r = await api("POST", `/comments/${spamId}/report`, { token: backer, body: { reason: "spam" } });
check("duplicate report ignored", r.json.hidden === false);
const third = (await api("POST", "/auth/signup", { body: { email: `c-${email}`, password: "Test@12345", fullName: "Third" } })).json.token;
r = await api("POST", `/comments/${spamId}/report`, { token: third, body: { reason: "spam" } });
check("3rd report hides comment", r.json.hidden === true, r.json);
r = await api("GET", `/campaigns/${waterId}/comments`);
check("hidden comment not listed", !r.json.items.some((c) => c.id === spamId));
r = await api("DELETE", `/comments/${replyId}`, { token: third });
check("stranger can't delete → 403", r.status === 403);

console.log("Uploads & AI");
if (IMAGE) {
  const form = new FormData();
  form.append("purpose", "cover");
  form.append("file", new Blob([await readFile(IMAGE)], { type: "image/png" }), "cover.png");
  r = await api("POST", "/uploads", { token: tc, form });
  check("upload cover to Cloudinary", r.status === 201 && r.json.url.includes("res.cloudinary.com") && r.json.width >= 1200, r.json);
}
const tiny = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let form = new FormData();
form.append("purpose", "cover");
form.append("file", new Blob([tiny], { type: "image/png" }), "tiny.png");
r = await api("POST", "/uploads", { token: tc, form });
check("too-small image rejected", r.status === 400 && /too small/.test(r.json.error.message), r.json);
form = new FormData();
form.append("purpose", "cover");
form.append("file", new Blob(["hello"], { type: "text/plain" }), "a.txt");
r = await api("POST", "/uploads", { token: tc, form });
check("wrong file type rejected", r.status === 400, r.json);

r = await api("POST", "/ai/draft", { token: tc, body: { text: "I want people in Austin to know that the Congress Avenue sidewalks are blocked by parked scooters, so wheelchair users and parents with strollers walk in the road. The city can enforce it if enough residents complain." } });
check(`AI draft (${r.json?.mode})`, r.status === 200 && r.json.draft.title.length <= 60 && r.json.draft.storyBlocks.length > 0, r.json);
console.log("    title:", r.json?.draft?.title, "| category:", r.json?.draft?.category);
const firstImage = (await api("GET", "/campaigns/school-shade-trees")).json.ad.assets[0]?.url;
r = await api("POST", "/ai/creative-feedback", { token: tc, body: { imageUrl: firstImage, adHeadline: "11 schools. High lead. One deadline." } });
check(`AI creative feedback (${r.json?.mode})`, r.status === 200 && r.json.suggestions.length > 0, r.json);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failed:", failures); process.exit(1); }
