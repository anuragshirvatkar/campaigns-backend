// Demo data: a ready-to-use account plus campaigns at different lifecycle stages.
//
//   npm run db:seed              local (skips if demo data already exists)
//   npm run db:seed -- --reset   local, removes the demo users (and everything they own) first
//   Server: docker compose run --rm api node dist/scripts/seed.js [--reset]
//
// Only the seeded accounts below are ever touched, so real sign-ups are never deleted.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import type { Category, CreatorType, Prisma } from "@prisma/client";
import { appConfig } from "../config/app.config.js";
import { env } from "../config/env.js";
import { cloudinary, cloudinaryFolder } from "../lib/cloudinary.js";
import { prisma } from "../lib/prisma.js";
import { platformFeeCents, processingFeeCents } from "../utils/money.js";
import { cpmCentsFor, reachPerDollar } from "../utils/reach.js";

const DEMO_PASSWORD = "Demo@1234";
const DEMO_DOCS_URL = `${env.PUBLIC_URL}/api/demo-docs`;
const IMAGES_DIR = resolve(process.cwd(), "prisma/seed-images");
const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);
const daysFromNow = (d: number) => new Date(now + d * DAY);

const USERS = [
  { key: "demo", email: "demo@campaignone.app", fullName: "Ananya Rao" },
  { key: "priya", email: "priya.sharma@example.com", fullName: "Priya Sharma" },
  { key: "rahul", email: "rahul.mehta@example.com", fullName: "Rahul Mehta" },
  { key: "meera", email: "meera.iyer@example.com", fullName: "Meera Iyer" },
  { key: "arjun", email: "arjun.nair@example.com", fullName: "Arjun Nair" },
  { key: "sana", email: "sana.khan@example.com", fullName: "Sana Khan" },
  { key: "vikram", email: "vikram.patil@example.com", fullName: "Vikram Patil" },
  { key: "cleanair", email: "team@cleanair-delhi.example.com", fullName: "Clean Air Collective" },
  { key: "adyar", email: "hello@adyar-parents.example.com", fullName: "Adyar Parents' Association" },
  { key: "mithi", email: "volunteers@mithi-river.example.com", fullName: "Mithi River Volunteers" },
  { key: "readers", email: "hello@readerscircle-blr.example.com", fullName: "Readers' Circle Bengaluru" },
  { key: "opengov", email: "team@opengov-forum.example.com", fullName: "Open Gov Forum" },
  { key: "vendors", email: "contact@vendor-rights.example.com", fullName: "Vendor Rights Network" },
  { key: "warli", email: "info@warli-art-trust.example.com", fullName: "Warli Art Trust" },
  { key: "kochi", email: "office@kochi-traders.example.com", fullName: "Kochi Traders Association" },
] as const;

type UserKey = (typeof USERS)[number]["key"];

// ─── Images ───────────────────────────────────────────────────────────────────

async function uploadSeedImage(file: string) {
  const path = resolve(IMAGES_DIR, file);
  if (!existsSync(path)) {
    console.warn(`  ! missing image ${file}, campaign will have no picture`);
    return null;
  }
  const name = file.replace(/\.[^.]+$/, "");
  const result = await cloudinary.uploader.upload(path, {
    public_id: name,
    folder: cloudinaryFolder("seed"),
    overwrite: false, // re-running the seed reuses the existing upload
    resource_type: "image",
  });
  return { url: result.secure_url, width: result.width, height: result.height };
}

async function image(slug: string, kind: "cover" | "ad") {
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    if (existsSync(resolve(IMAGES_DIR, `${slug}-${kind}.${ext}`))) return uploadSeedImage(`${slug}-${kind}.${ext}`);
  }
  console.warn(`  ! no ${kind} image for ${slug}`);
  return null;
}

// ─── Campaign content ─────────────────────────────────────────────────────────

type SeedCampaign = {
  slug: string;
  creator: UserKey;
  title: string;
  category: Category;
  creatorName: string;
  creatorType: CreatorType;
  creatorDescription: string;
  summary: string;
  targetAudience: string;
  whyItMatters: string;
  storyHeadline: string;
  storyIntro: string;
  storyBlocks: Prisma.InputJsonValue;
  sources: { id: string; title: string; url: string }[];
  adHeadline: string;
  adDescription: string;
  ctaText: string;
  reach: Prisma.InputJsonValue;
  durationDays: number;
  goalDollars: number;
  isFeatured: boolean;
  // funding: open for backing · promoting: funded, ads running · completed: final report out
  timeline: "funding" | "promoting" | "completed";
  publishedDaysAgo: number;
  deadlineInDays?: number;
  fundedDaysAgo?: number; // promoting/completed: when funding closed
  deliveryProgress?: number[]; // share of the ad budget spent at each daily delivery report
  contributions: [UserKey, number, number][]; // backer, dollars, days ago
  extraFollowers: UserKey[];
  updates: [string, string, number][];
};

const CAMPAIGNS: SeedCampaign[] = [
  {
    slug: "school-water",
    creator: "demo",
    title: "Safe drinking water in every Pune public school",
    category: "health",
    creatorName: "Ananya Rao",
    creatorType: "individual",
    creatorDescription: "Parent of two and member of a ward-level school committee in Pune.",
    summary:
      "Eleven of thirty older public schools tested above the safe limit for lead last spring. Funding to replace the pipes exists, but schools must apply before March.",
    targetAudience: "Parents and school-committee members in Pune, aged 28 to 55, plus local ward councillors.",
    whyItMatters:
      "The money to fix this is already set aside. What's missing is people knowing it's there and asking their school to apply before the deadline.",
    storyHeadline: "The pipes are old, the money exists, and the deadline is close",
    storyIntro:
      "Last spring a volunteer testing drive checked drinking-water taps in thirty of Pune's oldest public schools. Eleven came back above the safe limit for lead.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What the tests found" },
      {
        id: "b2",
        type: "paragraph",
        text: "Most of these schools still draw water through service lines laid decades ago. The testing drive sampled taps used by children every day, and **eleven of thirty** schools were above the safe limit.",
      },
      { id: "b3", type: "stat", value: "11 of 30", label: "older public schools tested above the safe limit for lead", sourceId: "s1" },
      {
        id: "b4",
        type: "paragraph",
        text: "Lead harms children's development even at low levels. There is no amount of exposure that is known to be safe.",
      },
      { id: "b5", type: "stat", value: "No safe level", label: "of lead exposure is known, according to the WHO", sourceId: "s2" },
      { id: "b6", type: "heading", text: "Why it hasn't been fixed" },
      {
        id: "b7",
        type: "paragraph",
        text: "A state infrastructure fund already covers pipe replacement, but each school has to apply, and the window closes in March. Most school committees simply haven't heard of it.",
      },
      { id: "b8", type: "action", label: "Ask your school committee to apply", url: `${DEMO_DOCS_URL}/apply-checklist` },
    ],
    sources: [
      { id: "s1", title: "Pune school drinking-water testing drive, spring 2026 (summary)", url: `${DEMO_DOCS_URL}/pune-school-water-testing-2026` },
      { id: "s2", title: "WHO fact sheet: Lead poisoning and health", url: "https://www.who.int/news-room/fact-sheets/detail/lead-poisoning-and-health" },
    ],
    adHeadline: "11 schools. High lead. One deadline.",
    adDescription: "The money to replace the pipes already exists, but schools must apply before March. Most haven't.",
    ctaText: "Learn more",
    reach: {
      locations: ["Pune", "Pimpri-Chinchwad"],
      ageMin: 28,
      ageMax: 55,
      interests: ["Parenting", "Education", "Public health"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 60, instagram: 40 },
    },
    durationDays: 30,
    goalDollars: 8000,
    isFeatured: true,
    timeline: "funding",
    publishedDaysAgo: 12,
    deadlineInDays: 18,
    contributions: [
      ["priya", 1500, 11], ["rahul", 1000, 10], ["meera", 800, 8], ["arjun", 500, 7],
      ["sana", 500, 5], ["vikram", 400, 3], ["priya", 300, 2], ["meera", 200, 1],
    ],
    extraFollowers: [],
    updates: [
      ["Three schools have started their applications", "Thank you! After the first week of ads, committees at three schools contacted the ward office to start their applications.", 6],
      ["Halfway there", "We've passed 50% of our goal. Every contribution keeps the ads running in more neighbourhoods.", 2],
    ],
  },
  {
    slug: "air-sensors",
    creator: "cleanair",
    title: "Publish Delhi's neighbourhood air-sensor data",
    category: "science",
    creatorName: "Clean Air Collective",
    creatorType: "nonprofit",
    creatorDescription: "A volunteer group of researchers and residents working on air quality in Delhi.",
    summary:
      "Hundreds of low-cost air sensors already run across Delhi neighbourhoods, but their readings stay private. We're asking for an open, hourly public feed.",
    targetAudience: "Delhi residents who follow air quality, parents, and people with asthma or heart conditions.",
    whyItMatters:
      "Neighbourhood-level readings would let families decide when it's safe to be outdoors, instead of relying on a single city-wide number.",
    storyHeadline: "The data exists. It just isn't public.",
    storyIntro:
      "Schools, housing societies and researchers already run air sensors across Delhi. Put together, they could show pollution street by street. Today, almost none of it is published.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "One number for a whole city" },
      {
        id: "b2",
        type: "paragraph",
        text: "The air quality index most people check is an average across monitoring stations. Pollution can differ sharply between neighbourhoods on the same day.",
      },
      { id: "b3", type: "stat", value: "99%", label: "of the world's population lived where WHO air-quality guideline levels were not met (2019)", sourceId: "s1" },
      { id: "b4", type: "heading", text: "What we're asking for" },
      {
        id: "b5",
        type: "paragraph",
        text: "An open, hourly feed of readings from sensors that are already installed, with a simple map. No new hardware, just publishing what is already measured.",
      },
      { id: "b6", type: "action", label: "Sign the open-data request", url: `${DEMO_DOCS_URL}/open-air-data` },
    ],
    sources: [
      { id: "s1", title: "WHO fact sheet: Ambient (outdoor) air quality and health", url: "https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health" },
      { id: "s2", title: "Clean Air Collective: sensor inventory (demo)", url: `${DEMO_DOCS_URL}/delhi-sensor-inventory` },
    ],
    adHeadline: "Your street's air, measured hourly",
    adDescription: "The sensors are already installed. Their readings just aren't public. Help change that.",
    ctaText: "See why",
    reach: {
      locations: ["Delhi", "Noida", "Gurugram"],
      ageMin: 22,
      ageMax: 60,
      interests: ["Health", "Environment", "Parenting"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 55, facebook: 45 },
    },
    durationDays: 30,
    goalDollars: 12000,
    isFeatured: true,
    timeline: "funding",
    publishedDaysAgo: 28,
    deadlineInDays: 2,
    contributions: [
      ["priya", 1000, 25], ["arjun", 1200, 20], ["sana", 750, 14], ["vikram", 600, 9], ["demo", 50, 4],
    ],
    extraFollowers: ["rahul"],
    updates: [["Two housing societies agreed to share their data", "Their sensors will be the first on the public map. Thank you for spreading the word.", 7]],
  },
  {
    slug: "school-crossing",
    creator: "adyar",
    title: "A supervised crossing outside Adyar primary school",
    category: "community",
    creatorName: "Adyar Parents' Association",
    creatorType: "community_group",
    creatorDescription: "Parents and teachers from three primary schools in Adyar, Chennai.",
    summary:
      "Children cross a busy road twice a day with no signal or warden. We asked residents to support a marked, supervised crossing at the school gate.",
    targetAudience: "Residents and parents in Adyar and nearby wards of Chennai.",
    whyItMatters:
      "A marked crossing with a warden at school times is cheap and proven. It needed enough local voices to get on the council agenda.",
    storyHeadline: "Twice a day, children cross without help",
    storyIntro:
      "At 8am and 3pm, hundreds of children cross the road outside the school gate between buses, autos and two-wheelers.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "The problem" },
      { id: "b2", type: "paragraph", text: "There is no zebra crossing, no signal and no warden at the gate. Parents take turns standing in the road." },
      { id: "b3", type: "stat", value: "Leading cause", label: "of death for children and young people aged 5–29 is road traffic injuries", sourceId: "s1" },
      { id: "b4", type: "heading", text: "The result" },
      { id: "b5", type: "paragraph", text: "After the campaign ran, the ward council approved a marked crossing and a warden at school times." },
    ],
    sources: [
      { id: "s1", title: "WHO fact sheet: Road traffic injuries", url: "https://www.who.int/news-room/fact-sheets/detail/road-traffic-injuries" },
      { id: "s2", title: "Adyar school-gate traffic count (demo)", url: `${DEMO_DOCS_URL}/adyar-traffic-count` },
    ],
    adHeadline: "Twice a day, no crossing",
    adDescription: "Children cross a busy road outside Adyar primary with no signal or warden. A crossing is cheap and proven.",
    ctaText: "Read more",
    reach: {
      locations: ["Chennai"],
      ageMin: 25,
      ageMax: 60,
      interests: ["Parenting", "Local news", "Road safety"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 60, instagram: 40 },
    },
    durationDays: 14,
    goalDollars: 4500,
    isFeatured: true,
    timeline: "completed",
    publishedDaysAgo: 40,
    fundedDaysAgo: 30,
    contributions: [
      ["rahul", 1500, 39], ["meera", 1200, 36], ["arjun", 900, 33], ["vikram", 800, 31], ["demo", 100, 30],
    ],
    extraFollowers: ["priya"],
    updates: [
      ["Fully funded in ten days", "Thank you to every backer. Ads start once distribution is prepared.", 30],
      ["The crossing is approved", "The ward council approved a marked crossing and a warden at school times. Thank you for making this heard.", 12],
    ],
  },
  {
    slug: "river-cleanup",
    creator: "mithi",
    title: "Clear the plastic from Mumbai's Mithi river before monsoon",
    category: "environment",
    creatorName: "Mithi River Volunteers",
    creatorType: "community_group",
    creatorDescription: "Residents from Kurla, Saki Naka and Powai who clean the Mithi's banks every Sunday.",
    summary:
      "Plastic dumped along the Mithi blocks its drains and makes monsoon flooding worse. We're asking residents to join four big clean-up drives before the rains.",
    targetAudience: "Residents of wards along the Mithi river in Mumbai, aged 18 to 45, students and housing societies.",
    whyItMatters:
      "Every kilo of plastic pulled out before June is one less blockage when the river floods. Clean-ups work, but only with enough hands.",
    storyHeadline: "The river floods where the plastic piles up",
    storyIntro:
      "Last monsoon, the worst waterlogging along the Mithi was at the same five spots where plastic collects. Our volunteers mapped every one of them.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What we found on the banks" },
      {
        id: "b2",
        type: "paragraph",
        text: "Over twelve Sunday drives, volunteers cleared and weighed what they collected. **Most of it was single-use plastic** that had washed down from the neighbourhoods upstream.",
      },
      { id: "b3", type: "stat", value: "4.2 tonnes", label: "of waste cleared from 3 km of riverbank in twelve drives", sourceId: "s1" },
      {
        id: "b4",
        type: "paragraph",
        text: "Plastic is now found in rivers worldwide, and blocked drains are a known cause of urban flooding. The fix here is simple: clear it before the rain arrives.",
      },
      { id: "b5", type: "heading", text: "The plan" },
      {
        id: "b6",
        type: "paragraph",
        text: "Four large drives in April and May, one at each blockage hotspot, with gloves, bags and a municipal truck booked for each.",
      },
      { id: "b7", type: "action", label: "Join a clean-up drive", url: `${DEMO_DOCS_URL}/mithi-river-survey` },
    ],
    sources: [
      { id: "s1", title: "Mithi river bank survey and clean-up log (demo)", url: `${DEMO_DOCS_URL}/mithi-river-survey` },
      { id: "s2", title: "UNEP: Plastic pollution", url: "https://www.unep.org/plastic-pollution" },
    ],
    adHeadline: "4 tonnes of plastic. One river.",
    adDescription: "The Mithi floods where plastic piles up. Join four clean-up drives before the monsoon.",
    ctaText: "Join a drive",
    reach: {
      locations: ["Mumbai"],
      ageMin: 18,
      ageMax: 45,
      interests: ["Environment", "Volunteering", "Local news"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 60, facebook: 40 },
    },
    durationDays: 30,
    goalDollars: 10000,
    isFeatured: false,
    timeline: "promoting",
    publishedDaysAgo: 20,
    fundedDaysAgo: 8,
    deliveryProgress: [0.18, 0.37, 0.55],
    contributions: [
      ["priya", 2500, 19], ["rahul", 1800, 17], ["meera", 1500, 15], ["arjun", 1200, 13],
      ["sana", 1000, 12], ["vikram", 900, 11], ["demo", 40, 10], ["priya", 1460, 9],
    ],
    extraFollowers: [],
    updates: [
      ["Fully funded!", "We reached our goal in twelve days. Ads start once the platform finishes setting up distribution.", 8],
      ["Ads are live", "Our message is now running on Instagram and Facebook across Mumbai. The first drive is this Sunday at Kurla.", 5],
    ],
  },
  {
    slug: "library-hours",
    creator: "readers",
    title: "Keep Bengaluru's public libraries open after 6 pm",
    category: "education",
    creatorName: "Readers' Circle Bengaluru",
    creatorType: "nonprofit",
    creatorDescription: "A reading group of students, teachers and retirees who volunteer at branch libraries across Bengaluru.",
    summary:
      "Most branch libraries close at 6 pm, before working people and many students can get there. We're asking the city to pilot evening hours at ten branches.",
    targetAudience: "Students, young professionals and parents in Bengaluru, aged 16 to 40.",
    whyItMatters:
      "A library you can't reach is a library you don't have. Evening hours would open quiet study space to thousands who have nowhere else to read.",
    storyHeadline: "The doors close just as people get free",
    storyIntro:
      "We counted who uses ten branch libraries and when. The answer was clear: the people who most need a quiet place to study arrive after the doors have shut.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Who is locked out" },
      {
        id: "b2",
        type: "paragraph",
        text: "Students preparing for exams, people working day shifts and parents after school pick-up all told us the same thing: **6 pm is too early**.",
      },
      { id: "b3", type: "stat", value: "7 in 10", label: "surveyed residents said they could only visit after 6 pm", sourceId: "s1" },
      { id: "b4", type: "heading", text: "A small, cheap pilot" },
      {
        id: "b5",
        type: "paragraph",
        text: "Ten branches open until 9 pm for six months, staffed by one librarian and trained volunteers. If the visits aren't there, the pilot ends.",
      },
      { id: "b6", type: "action", label: "Read the pilot proposal", url: `${DEMO_DOCS_URL}/bengaluru-library-survey` },
    ],
    sources: [
      { id: "s1", title: "Bengaluru branch-library usage survey (demo)", url: `${DEMO_DOCS_URL}/bengaluru-library-survey` },
      { id: "s2", title: "IFLA: International Federation of Library Associations", url: "https://www.ifla.org/" },
    ],
    adHeadline: "Your library closes at 6. You get free at 7.",
    adDescription: "Back a six-month pilot to keep ten Bengaluru libraries open until 9 pm.",
    ctaText: "Learn more",
    reach: {
      locations: ["Bengaluru"],
      ageMin: 16,
      ageMax: 40,
      interests: ["Education", "Books", "Students"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 70, facebook: 30 },
    },
    durationDays: 30,
    goalDollars: 6000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 2,
    deadlineInDays: 28,
    contributions: [["rahul", 400, 1.5], ["sana", 250, 1], ["meera", 200, 0.6], ["demo", 25, 0.3]],
    extraFollowers: ["arjun"],
    updates: [],
  },
  {
    slug: "rti-awareness",
    creator: "opengov",
    title: "Every citizen should know how to file an RTI",
    category: "public_policy",
    creatorName: "Open Gov Forum",
    creatorType: "nonprofit",
    creatorDescription: "Volunteers who run free weekend help desks for filing Right to Information requests.",
    summary:
      "The Right to Information Act lets anyone ask the government for records, online, for ₹10. Most people have never used it. We want to change that with a simple explainer.",
    targetAudience: "Adults across India, aged 20 to 60, especially first-time voters and students.",
    whyItMatters:
      "An RTI can find a stalled pension, a missing ration card or an unexplained road budget. The right only helps people who know it exists.",
    storyHeadline: "A ₹10 question the government must answer",
    storyIntro:
      "Under the RTI Act, a public authority has to reply to your request within 30 days. You can file it online in about ten minutes.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What an RTI can do" },
      {
        id: "b2",
        type: "paragraph",
        text: "People at our help desks have used RTIs to trace delayed scholarships, get copies of their land records and find out why a road was never built.",
      },
      { id: "b3", type: "stat", value: "30 days", label: "is the time limit for a public authority to reply to an RTI request", sourceId: "s1" },
      { id: "b4", type: "heading", text: "Why so few use it" },
      {
        id: "b5",
        type: "paragraph",
        text: "At our desks, **most first-time visitors had never heard that they could file online**. A short, clear explainer is the missing piece.",
      },
      { id: "b6", type: "stat", value: "6 in 10", label: "help-desk visitors had never filed an RTI before", sourceId: "s2" },
      { id: "b7", type: "action", label: "File an RTI online", url: "https://rtionline.gov.in/" },
    ],
    sources: [
      { id: "s1", title: "Right to Information portal, Government of India", url: "https://rti.gov.in/" },
      { id: "s2", title: "Open Gov Forum help-desk visitor survey (demo)", url: `${DEMO_DOCS_URL}/rti-help-desk-survey` },
      { id: "s3", title: "RTI Online: file a request", url: "https://rtionline.gov.in/" },
    ],
    adHeadline: "₹10. 30 days. Your right to know.",
    adDescription: "Learn how to file a Right to Information request online in ten minutes.",
    ctaText: "See how",
    reach: {
      locations: ["India"],
      ageMin: 20,
      ageMax: 60,
      interests: ["Civic engagement", "Local news", "Law"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 55, instagram: 45 },
    },
    durationDays: 30,
    goalDollars: 5000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 19,
    deadlineInDays: 11,
    contributions: [["priya", 1200, 18], ["arjun", 900, 16], ["vikram", 800, 12], ["sana", 600, 9], ["rahul", 500, 5], ["meera", 500, 2]],
    extraFollowers: [],
    updates: [["Almost there", "We're at 90% of our goal. A final push and the explainer reaches every state.", 2]],
  },
  {
    slug: "street-vendors",
    creator: "vendors",
    title: "Fair licences for Hyderabad's street vendors",
    category: "economic_policy",
    creatorName: "Vendor Rights Network",
    creatorType: "organization",
    creatorDescription: "A network of vendor unions and volunteers helping street vendors in Hyderabad get licensed.",
    summary:
      "The national street-vending law promises vendors a licence and a fixed spot, but most in Hyderabad still have neither. We want the city to finish its vendor survey and issue licences.",
    targetAudience: "Hyderabad residents who shop at street markets, aged 22 to 55.",
    whyItMatters:
      "Without a licence, vendors can be moved on or fined any day. A licence means a stable income for families and safer, planned markets for everyone.",
    storyHeadline: "The law exists. The licences don't.",
    storyIntro:
      "In 2014 India passed a law to protect street vendors' livelihoods. A decade later, many vendors in Hyderabad are still waiting to be counted.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Working without a licence" },
      {
        id: "b2",
        type: "paragraph",
        text: "Vendors told us they lose days of income every month to evictions and seized carts. **Most have sold from the same spot for years.**",
      },
      { id: "b3", type: "stat", value: "Over half", label: "of vendors we surveyed had no licence or certificate of vending", sourceId: "s1" },
      { id: "b4", type: "heading", text: "What we're asking" },
      {
        id: "b5",
        type: "paragraph",
        text: "Complete the city's vendor survey, publish the list, and issue certificates of vending as the law requires.",
      },
    ],
    sources: [
      { id: "s1", title: "Hyderabad street-vendor licence survey (demo)", url: `${DEMO_DOCS_URL}/street-vending-licences` },
      { id: "s2", title: "India Code: central and state laws", url: "https://www.indiacode.nic.in/" },
    ],
    adHeadline: "Same spot for 10 years. Still no licence.",
    adDescription: "Hyderabad's street vendors are still waiting for licences the law promised in 2014.",
    ctaText: "Learn more",
    reach: {
      locations: ["Hyderabad", "Secunderabad"],
      ageMin: 22,
      ageMax: 55,
      interests: ["Local news", "Small business", "Civic engagement"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 60, instagram: 40 },
    },
    durationDays: 30,
    goalDollars: 7000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 9,
    deadlineInDays: 21,
    contributions: [["arjun", 1000, 8], ["sana", 700, 6], ["priya", 600, 4], ["vikram", 500, 2]],
    extraFollowers: ["meera"],
    updates: [["Vendors are sharing it", "Market associations in Ameerpet and Koti are sharing the campaign with their members.", 3]],
  },
  {
    slug: "folk-art",
    creator: "warli",
    title: "Save Warli painting: teach it in village schools",
    category: "arts_culture",
    creatorName: "Warli Art Trust",
    creatorType: "nonprofit",
    creatorDescription: "Warli artists and teachers from Palghar district working to pass the art form to the next generation.",
    summary:
      "Fewer young people in Palghar are learning Warli painting. We asked supporters to back weekly art classes taught by local Warli artists in village schools.",
    targetAudience: "Art lovers, teachers and parents in Maharashtra, aged 20 to 55.",
    whyItMatters:
      "Warli painting is passed on by hand, from elders to children. If the children stop learning, the art fades within a generation.",
    storyHeadline: "An art form that lives on the walls of homes",
    storyIntro:
      "Warli paintings are made with white rice paste on mud walls, showing village life in simple circles, triangles and lines.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Why it needed help" },
      {
        id: "b2",
        type: "paragraph",
        text: "Artists told us that young people now leave for city jobs before they learn. **Few village schools teach any local art at all.**",
      },
      { id: "b3", type: "stat", value: "12 schools", label: "signed up for weekly Warli classes after the campaign", sourceId: "s1" },
      { id: "b4", type: "heading", text: "The result" },
      {
        id: "b5",
        type: "paragraph",
        text: "After the campaign ran, twelve schools in Palghar started weekly classes taught by local Warli artists, paid a fair fee per session.",
      },
    ],
    sources: [
      { id: "s1", title: "Warli classes in Palghar schools: pilot summary (demo)", url: `${DEMO_DOCS_URL}/warli-schools-pilot` },
      { id: "s2", title: "Ministry of Culture, Government of India", url: "https://www.indiaculture.gov.in/" },
    ],
    adHeadline: "Painted on walls for centuries. Fading in one generation.",
    adDescription: "Help Warli artists teach their art in Palghar's village schools.",
    ctaText: "Read more",
    reach: {
      locations: ["Mumbai", "Pune", "Palghar"],
      ageMin: 20,
      ageMax: 55,
      interests: ["Arts", "Culture", "Education"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 65, facebook: 35 },
    },
    durationDays: 14,
    goalDollars: 3500,
    isFeatured: false,
    timeline: "completed",
    publishedDaysAgo: 50,
    fundedDaysAgo: 41,
    contributions: [["meera", 1200, 48], ["priya", 900, 46], ["rahul", 700, 44], ["demo", 30, 43], ["sana", 820, 42]],
    extraFollowers: ["vikram"],
    updates: [
      ["Funded in nine days", "Thank you! Ads begin once distribution is set up.", 41],
      ["Classes have started", "Twelve schools now hold weekly Warli classes. Thank you for helping keep this art alive.", 30],
    ],
  },
  {
    slug: "local-shops",
    creator: "kochi",
    title: "Shop local: help Kochi's small grocers go digital",
    category: "business",
    creatorName: "Kochi Traders Association",
    creatorType: "business",
    creatorDescription: "An association of over 200 small grocers and family shops across Kochi.",
    summary:
      "Neighbourhood grocers are losing customers to delivery apps. We're running free workshops to help them take UPI payments and WhatsApp orders, and asking residents to shop local.",
    targetAudience: "Kochi residents who shop for groceries, aged 22 to 50.",
    whyItMatters:
      "Small shops keep neighbourhoods alive and know their customers by name. A few simple digital tools can help them keep up.",
    storyHeadline: "The corner shop can deliver too",
    storyIntro:
      "Many family grocers already offer credit and home delivery to regulars. What they often lack is a way for new customers to find and order from them.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What's happening to small shops" },
      {
        id: "b2",
        type: "paragraph",
        text: "Shop owners in our association told us their weekday footfall has dropped as more people order online. **Most already have a smartphone**, but few use it for orders.",
      },
      { id: "b3", type: "stat", value: "8 in 10", label: "member shops have a smartphone, but only 3 in 10 take orders on it", sourceId: "s1" },
      { id: "b4", type: "heading", text: "Our plan" },
      {
        id: "b5",
        type: "paragraph",
        text: "Free two-hour workshops on UPI payments, WhatsApp catalogues and simple delivery, plus a campaign asking residents to order from their local shop first.",
      },
    ],
    sources: [
      { id: "s1", title: "Kochi Traders Association member survey (demo)", url: `${DEMO_DOCS_URL}/kochi-grocers-survey` },
      { id: "s2", title: "NPCI: National Payments Corporation of India (UPI)", url: "https://www.npci.org.in/" },
    ],
    adHeadline: "Your corner shop delivers too",
    adDescription: "Help Kochi's family grocers take UPI and WhatsApp orders, and keep your neighbourhood shop open.",
    ctaText: "Shop local",
    reach: {
      locations: ["Kochi"],
      ageMin: 22,
      ageMax: 50,
      interests: ["Small business", "Local news", "Shopping"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 50, instagram: 50 },
    },
    durationDays: 14,
    goalDollars: 5000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 13,
    deadlineInDays: 1,
    contributions: [["vikram", 900, 12], ["arjun", 700, 10], ["rahul", 600, 7], ["meera", 500, 3]],
    extraFollowers: [],
    updates: [["One day left", "We're past halfway. Every contribution in the last day still goes into ads.", 0.5]],
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const reset = process.argv.includes("--reset");
  const emails = USERS.map((u) => u.email);

  if (reset) {
    const { count } = await prisma.user.deleteMany({ where: { email: { in: emails } } });
    console.log(`Removed ${count} demo users and everything they owned.`);
  } else if (await prisma.user.findUnique({ where: { email: "demo@campaignone.app" } })) {
    console.log("Demo data already exists. Run with --reset to recreate it.");
    return;
  }

  console.log("Creating users...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {} as Record<UserKey, string>;
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: { email: u.email, fullName: u.fullName, passwordHash, createdAt: daysAgo(60) },
    });
    users[u.key] = created.id;
  }

  for (const s of CAMPAIGNS) {
    console.log(`Creating "${s.title}"...`);
    const [cover, ad] = await Promise.all([image(s.slug, "cover"), image(s.slug, "ad")]);
    const goalCents = s.goalDollars * 100;
    const published = daysAgo(s.publishedDaysAgo);
    const completed = s.timeline === "completed";
    const funded = s.timeline !== "funding";
    // Funding closes, distribution is prepared the next day, ads start the day after
    const fundedAgo = s.fundedDaysAgo ?? 0;
    const promotingAgo = fundedAgo - 2;
    const progress = s.deliveryProgress ?? FULL_DELIVERY;
    const completedAgo = promotingAgo - progress.length;

    const campaign = await prisma.campaign.create({
      data: {
        creatorId: users[s.creator],
        slug: s.slug,
        status: s.timeline,
        currentStep: 5,
        title: s.title,
        category: s.category,
        creatorName: s.creatorName,
        creatorType: s.creatorType,
        creatorDescription: s.creatorDescription,
        summary: s.summary,
        coverImageUrl: cover?.url ?? null,
        targetAudience: s.targetAudience,
        whyItMatters: s.whyItMatters,
        storyHeadline: s.storyHeadline,
        storyIntro: s.storyIntro,
        storyBlocks: s.storyBlocks,
        sources: s.sources,
        adHeadline: s.adHeadline,
        adDescription: s.adDescription,
        ctaText: s.ctaText,
        adAssets: ad ? [{ id: "a1", type: "image", url: ad.url, width: ad.width, height: ad.height }] : [],
        reach: s.reach,
        durationDays: s.durationDays,
        fundingGoalCents: goalCents,
        rulesAcceptedAt: daysAgo(s.publishedDaysAgo + 1),
        reachPerDollar: reachPerDollar(s.category),
        isFeatured: s.isFeatured,
        isDemo: true,
        submittedAt: daysAgo(s.publishedDaysAgo + 1),
        approvedAt: published,
        publishedAt: published,
        fundingDeadline: funded ? daysAgo(s.publishedDaysAgo - s.durationDays) : daysFromNow(s.deadlineInDays ?? 14),
        ...(funded && {
          fundedAt: daysAgo(fundedAgo),
          distributionPrepAt: daysAgo(fundedAgo - 1),
          promotingAt: daysAgo(promotingAgo),
        }),
        ...(completed && { completedAt: daysAgo(completedAgo) }),
        statusChangedAt: completed ? daysAgo(completedAgo) : funded ? daysAgo(promotingAgo) : published,
        createdAt: daysAgo(s.publishedDaysAgo + 3),
      },
    });

    // Contributions (succeeded), and every backer follows the campaign
    for (const [i, [backer, dollars, ago]] of s.contributions.entries()) {
      const amountCents = dollars * 100;
      await prisma.contribution.create({
        data: {
          campaignId: campaign.id,
          userId: users[backer],
          amountCents,
          feeCents: platformFeeCents(amountCents),
          processingFeeCents: processingFeeCents(amountCents),
          status: "succeeded",
          isPublic: i % 3 === 0, // most backers stay private (the default)
          paymentRef: `demo_pay_seed_${s.slug}_${i}`,
          idempotencyKey: `seed-${s.slug}-${i}`,
          paidAt: daysAgo(ago),
          createdAt: daysAgo(ago),
        },
      });
    }
    const followers = new Set<UserKey>([...s.contributions.map(([b]) => b), ...s.extraFollowers]);
    followers.delete(s.creator);
    await prisma.follow.createMany({
      data: [...followers].map((key) => ({ userId: users[key], campaignId: campaign.id, createdAt: daysAgo(s.publishedDaysAgo - 1) })),
    });

    await prisma.campaignUpdate.createMany({
      data: s.updates.map(([title, body, ago]) => ({ campaignId: campaign.id, title, body, createdAt: daysAgo(ago) })),
    });

    if (funded) await seedDeliveryMetrics(campaign.id, s, promotingAgo, progress);
  }

  await seedConversation(users);
  await seedDraft(users.demo);
  await seedChangesRequested(users.demo);
  await seedNotifications(users);

  console.log(`\nDone. Log in as demo@campaignone.app / ${DEMO_PASSWORD}`);
}

// Share of the ad budget spent by each daily report; a finished promotion ends at 100%
const FULL_DELIVERY = [0.12, 0.3, 0.5, 0.68, 0.86, 1];

/** Daily delivery reports from the day ads started; a finished campaign spends exactly its ad budget. */
async function seedDeliveryMetrics(campaignId: string, s: SeedCampaign, promotingAgo: number, progress: number[]) {
  const raisedCents = s.contributions.reduce((sum, [, d]) => sum + d * 100, 0);
  const adBudget = raisedCents - platformFeeCents(raisedCents);
  const budgetSplit = (s.reach as { budgetSplit: Record<"facebook" | "instagram", number> }).budgetSplit;
  const cpmFactor = { facebook: 0.95, instagram: 1.1 };
  const rows: Prisma.DistributionMetricCreateManyInput[] = [];

  progress.forEach((p, day) => {
    for (const channel of ["facebook", "instagram"] as const) {
      const spend = Math.round(adBudget * ((budgetSplit[channel] ?? 0) / 100) * p);
      const impressions = Math.round((spend / (cpmCentsFor(s.category) * cpmFactor[channel])) * 1000);
      rows.push({
        campaignId,
        channel,
        recordedAt: daysAgo(promotingAgo - day),
        adSpendCents: spend,
        impressions,
        reach: Math.round(impressions / appConfig.reach.frequency),
        clicks: Math.round(impressions * appConfig.reach.ctr),
      });
    }
  });
  await prisma.distributionMetric.createMany({ data: rows });
}

async function seedConversation(users: Record<UserKey, string>) {
  const water = await prisma.campaign.findUniqueOrThrow({ where: { slug: "school-water" } });
  const first = await prisma.comment.create({
    data: {
      campaignId: water.id,
      userId: users.priya,
      body: "Our school in Kothrud was one of the eleven. The committee had no idea the fund existed.",
      createdAt: daysAgo(9),
    },
  });
  await prisma.comment.create({
    data: {
      campaignId: water.id,
      userId: users.demo,
      parentId: first.id,
      body: "Thank you for sharing this, Priya. I've added the application checklist link to the story.",
      createdAt: daysAgo(8),
    },
  });
  await prisma.comment.create({
    data: {
      campaignId: water.id,
      userId: users.rahul,
      body: "Shared with our housing society group. Is there a list of which schools were tested?",
      createdAt: daysAgo(4),
    },
  });

  const feedback: [string, UserKey, "no" | "somewhat" | "yes", "no" | "somewhat" | "yes"][] = [
    ["school-water", "priya", "yes", "yes"],
    ["school-water", "rahul", "yes", "somewhat"],
    ["school-water", "meera", "somewhat", "yes"],
    ["school-water", "sana", "yes", "no"],
    ["air-sensors", "arjun", "yes", "somewhat"],
    ["school-crossing", "vikram", "somewhat", "yes"],
    ["river-cleanup", "priya", "yes", "yes"],
    ["river-cleanup", "arjun", "yes", "somewhat"],
    ["rti-awareness", "sana", "yes", "yes"],
    ["rti-awareness", "rahul", "somewhat", "yes"],
    ["folk-art", "meera", "yes", "somewhat"],
    ["street-vendors", "vikram", "somewhat", "somewhat"],
  ];
  for (const [slug, user, visuals, changed] of feedback) {
    const c = await prisma.campaign.findUniqueOrThrow({ where: { slug } });
    await prisma.feedbackResponse.create({
      data: { campaignId: c.id, userId: users[user], visualsAnswer: visuals, changedMindAnswer: changed },
    });
  }
}

/** A campaign the review sent back, so the "changes requested" flow can be shown without waiting. */
async function seedChangesRequested(demoUserId: string) {
  // Its own pictures if added (kothrud-streetlights-cover|ad), otherwise a city scene
  const cover = (await image("kothrud-streetlights", "cover")) ?? (await image("air-sensors", "cover"));
  const ad = (await image("kothrud-streetlights", "ad")) ?? (await image("air-sensors", "ad"));
  const submitted = daysAgo(0.2);
  const reviewed = new Date(submitted.getTime() + 20_000);
  const campaign = await prisma.campaign.create({
    data: {
      creatorId: demoUserId,
      slug: "kothrud-streetlights",
      status: "changes_requested",
      currentStep: 5,
      title: "Fix the broken streetlights on Karve Road",
      category: "community",
      creatorName: "Ananya Rao",
      creatorType: "individual",
      summary: "Eighteen of forty streetlights on Karve Road have been out since June. Residents want them repaired before the festival season.",
      coverImageUrl: cover?.url ?? null,
      storyBlocks: [
        { id: "b1", type: "paragraph", text: "Eighteen of the forty streetlights between Nal Stop and the Kothrud depot have been dark since June. Complaints to the ward office have had no response, and residents now avoid the road after dark." },
        { id: "b2", type: "stat", value: "70%", label: "of night-time thefts on the road happened along the dark stretch" },
      ],
      sources: [],
      adAssets: ad ? [{ id: "a1", type: "image", url: ad.url, width: ad.width, height: ad.height }] : [],
      reach: { locations: ["Pune"], ageMin: 18, ageMax: 65, interests: ["Local news"], channels: ["facebook"], budgetSplit: { facebook: 100 } },
      durationDays: 30,
      fundingGoalCents: 200_000,
      rulesAcceptedAt: submitted,
      reachPerDollar: reachPerDollar("community"),
      isDemo: true,
      submittedAt: submitted,
      reviewedAt: reviewed,
      statusChangedAt: reviewed,
      createdAt: daysAgo(1),
    },
  });
  const issue = { field: "storyBlocks", step: 2, message: 'Link the statistic "70%" to a source so readers can check it.' };
  await prisma.campaignReview.create({
    data: {
      campaignId: campaign.id,
      decision: "changes_requested",
      summary: "Your campaign is nearly ready. Fix the points below and resubmit.",
      issues: [issue],
      reviewer: "ai",
      createdAt: reviewed,
    },
  });
  await prisma.notification.create({
    data: {
      userId: demoUserId,
      campaignId: campaign.id,
      type: "campaign_changes_requested",
      title: `Changes requested for ${campaign.title}`,
      body: "Your campaign is nearly ready. Fix the points below and resubmit. Open the campaign to see what to fix, then resubmit.",
      dedupeKey: `review:${campaign.id}:seed:${demoUserId}`,
      createdAt: reviewed,
    },
  });
}

/** An unfinished draft, so "Resume draft" has something to show. */
async function seedDraft(demoUserId: string) {
  await prisma.campaign.create({
    data: {
      creatorId: demoUserId,
      status: "draft",
      currentStep: 2,
      title: "Who pays when a water main bursts?",
      category: "public_policy",
      creatorName: "Ananya Rao",
      creatorType: "individual",
      summary: "Residents are billed for repairs to mains the city is responsible for. Here's how the rules actually work.",
      storyHeadline: "The bill that shouldn't be yours",
      storyBlocks: [{ id: "b1", type: "paragraph", text: "When a main burst on our street last month, every household received a repair bill." }],
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  });
}

async function seedNotifications(users: Record<UserKey, string>) {
  const bySlug = Object.fromEntries(
    (await prisma.campaign.findMany({ where: { slug: { in: CAMPAIGNS.map((c) => c.slug) } } })).map((c) => [c.slug, c.id]),
  );
  const demo = users.demo;
  // People reached so far by the promoting campaign, as its live report shows it
  const latest = await prisma.distributionMetric.findFirst({ where: { campaignId: bySlug["river-cleanup"] }, orderBy: { recordedAt: "desc" } });
  const riverReach = latest
    ? (await prisma.distributionMetric.aggregate({ where: { campaignId: bySlug["river-cleanup"], recordedAt: latest.recordedAt }, _sum: { reach: true } }))._sum.reach ?? 0
    : 0;
  const items: Prisma.NotificationCreateManyInput[] = [
    { key: `approved:${bySlug["school-water"]}:seed`, type: "campaign_approved", campaignId: bySlug["school-water"], title: "Safe drinking water in every Pune public school is approved and live", body: "Your campaign is now open for backing. Share it to get your first backers.", ago: 12, read: true },
    { key: `milestone:25:${bySlug["school-water"]}`, type: "funding_milestone", campaignId: bySlug["school-water"], title: "Safe drinking water in every Pune public school is 25% funded", body: "$2,500 of $8,000 raised to promote this message.", ago: 10, read: true },
    { key: "contribution-succeeded:seed", type: "contribution_succeeded", campaignId: bySlug["air-sensors"], title: "Thank you for backing Publish Delhi's neighbourhood air-sensor data", body: "Your $50 contribution went through. $40 goes straight into promoting the message.", ago: 4, read: true },
    { key: "comment:seed", type: "new_comment", campaignId: bySlug["school-water"], title: "New comment on Safe drinking water in every Pune public school", body: "Rahul M.: Shared with our housing society group. Is there a list of which schools were tested?", ago: 4, read: false },
    { key: `milestone:50:${bySlug["school-water"]}`, type: "funding_milestone", campaignId: bySlug["school-water"], title: "Safe drinking water in every Pune public school is 50% funded", body: "$4,200 of $8,000 raised to promote this message.", ago: 2, read: false },
    { key: `deadline:${bySlug["air-sensors"]}`, type: "deadline_approaching", campaignId: bySlug["air-sensors"], title: "2 days left for Publish Delhi's neighbourhood air-sensor data", body: "30% funded so far. Contributions close when the deadline passes.", ago: 0.2, read: false },
    { key: `report:${bySlug["school-crossing"]}`, type: "report_available", campaignId: bySlug["school-crossing"], title: "The final report for A supervised crossing outside Adyar primary school is ready", body: "See funds raised, ad spend, impressions, clicks and people reached.", ago: 22, read: true },
    { key: `report:${bySlug["folk-art"]}`, type: "report_available", campaignId: bySlug["folk-art"], title: "The final report for Save Warli painting: teach it in village schools is ready", body: "See funds raised, ad spend, impressions, clicks and people reached.", ago: 33, read: true },
    { key: "contribution-succeeded:seed-river", type: "contribution_succeeded", campaignId: bySlug["river-cleanup"], title: "Thank you for backing Clear the plastic from Mumbai's Mithi river before monsoon", body: "Your $40 contribution went through. $32 goes straight into promoting the message.", ago: 10, read: true },
    { key: `promotion:${bySlug["river-cleanup"]}`, type: "promotion_started", campaignId: bySlug["river-cleanup"], title: "Ads are now running for Clear the plastic from Mumbai's Mithi river before monsoon", body: "Delivery numbers will appear in the live report as they come in.", ago: 6, read: true },
    { key: `progress:half:${bySlug["river-cleanup"]}`, type: "distribution_progress", campaignId: bySlug["river-cleanup"], title: `Clear the plastic from Mumbai's Mithi river before monsoon has reached about ${riverReach.toLocaleString("en-US")} people`, body: "Measured by the ad platform so far. The promotion is about halfway through its budget.", ago: 1, read: false },
    { key: "contribution-succeeded:seed-library", type: "contribution_succeeded", campaignId: bySlug["library-hours"], title: "Thank you for backing Keep Bengaluru's public libraries open after 6 pm", body: "Your $25 contribution went through. $20 goes straight into promoting the message.", ago: 0.3, read: false },
  ].map(({ key, ago, read, ...n }) => ({
    ...n,
    type: n.type as Prisma.NotificationCreateManyInput["type"],
    userId: demo,
    // Same key format as live notifications, so jobs never send these a second time
    dedupeKey: `${key}:${demo}`,
    createdAt: daysAgo(ago),
    readAt: read ? daysAgo(ago) : null,
  }));
  await prisma.notification.createMany({ data: items });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
