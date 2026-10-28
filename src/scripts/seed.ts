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
  { key: "demo", email: "demo@campaignone.app", fullName: "Emily Carter" },
  { key: "sarah", email: "sarah.johnson@example.com", fullName: "Sarah Johnson" },
  { key: "michael", email: "michael.brown@example.com", fullName: "Michael Brown" },
  { key: "jessica", email: "jessica.davis@example.com", fullName: "Jessica Davis" },
  { key: "david", email: "david.miller@example.com", fullName: "David Miller" },
  { key: "ashley", email: "ashley.wilson@example.com", fullName: "Ashley Wilson" },
  { key: "chris", email: "chris.martinez@example.com", fullName: "Chris Martinez" },
  { key: "stem", email: "team@stembridge-columbus.example.com", fullName: "STEM Bridge Columbus" },
  { key: "arts", email: "hello@mainstreet-arts.example.com", fullName: "Main Street Arts Alliance" },
  { key: "refill", email: "volunteers@refill-phoenix.example.com", fullName: "Refill Phoenix" },
  { key: "library", email: "hello@library-access-denver.example.com", fullName: "Library Access Coalition" },
  { key: "trucks", email: "contact@rosecity-foodtrucks.example.com", fullName: "Rose City Food Truck Association" },
] as const;

// Accounts from earlier versions of the seed; --reset removes them too
const OLD_EMAILS = [
  "priya.sharma@example.com", "rahul.mehta@example.com", "meera.iyer@example.com", "arjun.nair@example.com",
  "sana.khan@example.com", "vikram.patil@example.com", "team@cleanair-delhi.example.com",
  "hello@adyar-parents.example.com", "volunteers@mithi-river.example.com", "hello@readerscircle-blr.example.com",
  "team@opengov-forum.example.com", "contact@vendor-rights.example.com", "info@warli-art-trust.example.com",
  "office@kochi-traders.example.com",
];

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

/** prisma/seed-images/<prefix>-cover (wide) or <prefix>-ad (square) */
async function image(prefix: string, kind: "cover" | "ad") {
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    if (existsSync(resolve(IMAGES_DIR, `${prefix}-${kind}.${ext}`))) return uploadSeedImage(`${prefix}-${kind}.${ext}`);
  }
  console.warn(`  ! no ${kind} image for ${prefix}`);
  return null;
}

// ─── Campaign content ─────────────────────────────────────────────────────────

type SeedCampaign = {
  slug: string;
  images: string; // file prefix in prisma/seed-images
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
    slug: "school-shade-trees",
    images: "school-tree",
    creator: "demo",
    title: "Plant More Shade Trees Along School Routes",
    category: "environment",
    creatorName: "Emily Carter",
    creatorType: "individual",
    creatorDescription: "Parent of two and PTA volunteer at an elementary school in Austin, Texas.",
    summary:
      "Kids walking to school in Austin cross long stretches with no shade, where sidewalks hit 130°F in September. The city will plant street trees for free, but neighbors have to request them by March.",
    targetAudience: "Parents, PTA members and homeowners in Austin, aged 28 to 55, plus city council offices.",
    whyItMatters:
      "The program to plant the trees already exists and is free. What's missing is neighbors knowing about it and requesting trees on the routes kids walk every day.",
    storyHeadline: "The walk to school shouldn't be the hottest part of the day",
    storyIntro:
      "This summer, parent volunteers walked the twelve busiest routes to six Austin elementary schools at 3 pm and measured the sidewalks. Most of each route had no shade at all.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What we measured" },
      {
        id: "b2",
        type: "paragraph",
        text: "On average, **only 18% of each route was shaded**. The open stretches run along wide roads right next to school gates, where kids wait for crossings in full sun.",
      },
      { id: "b3", type: "stat", value: "131°F", label: "hottest sidewalk reading on a walking route at school pickup time", sourceId: "s1" },
      {
        id: "b4",
        type: "paragraph",
        text: "Trees are one of the simplest ways to cool a street. Shaded pavement stays far cooler than pavement in direct sun, and the effect lasts for decades.",
      },
      { id: "b5", type: "stat", value: "20–45°F", label: "cooler: shaded surfaces compared with the peak temperature of unshaded ones, according to the EPA", sourceId: "s2" },
      { id: "b6", type: "heading", text: "Why it hasn't happened yet" },
      {
        id: "b7",
        type: "paragraph",
        text: "The city's street-tree program plants and waters trees for free, but only where neighbors ask. Requests for spring planting close on March 31, and most families have never heard of it.",
      },
      { id: "b8", type: "action", label: "Request a tree on your block", url: `${DEMO_DOCS_URL}/tree-request-checklist` },
    ],
    sources: [
      { id: "s1", title: "Shade on Austin's walking routes to school, summer 2026 (summary)", url: `${DEMO_DOCS_URL}/austin-school-routes-heat-survey` },
      { id: "s2", title: "EPA: Using trees and vegetation to reduce heat islands", url: "https://www.epa.gov/heatislands/using-trees-and-vegetation-reduce-heat-islands" },
    ],
    adHeadline: "131°F on the walk to school",
    adDescription: "The city plants street trees for free, but neighbors must ask by March 31. Most haven't.",
    ctaText: "Learn more",
    reach: {
      locations: ["Austin", "Round Rock"],
      ageMin: 28,
      ageMax: 55,
      interests: ["Parenting", "Education", "Environment"],
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
      ["sarah", 1500, 11], ["michael", 1000, 10], ["jessica", 800, 8], ["david", 500, 7],
      ["ashley", 500, 5], ["chris", 400, 3], ["sarah", 300, 2], ["jessica", 200, 1],
    ],
    extraFollowers: [],
    updates: [
      ["Forty tree requests filed", "Thank you! After the first week of ads, neighbors along four school routes filed forty requests with the city.", 6],
      ["Halfway there", "We've passed 50% of our goal. Every contribution keeps the ads running in more neighborhoods.", 2],
    ],
  },
  {
    slug: "open-university-labs",
    images: "university-labs",
    creator: "stem",
    title: "Open University Labs to Local School Groups",
    category: "science",
    creatorName: "STEM Bridge Columbus",
    creatorType: "nonprofit",
    creatorDescription: "Teachers, graduate students and parents in Columbus, Ohio working to give every student hands-on science.",
    summary:
      "Most of the university's teaching labs sit empty on Saturdays, while many nearby public schools have no working science lab. We're asking the university to open them to supervised school groups.",
    targetAudience: "Parents, teachers and university alumni in Columbus, aged 22 to 60.",
    whyItMatters:
      "Students who do real experiments are more likely to stick with science. The labs, equipment and volunteers already exist. They just need an open door.",
    storyHeadline: "The labs are already built. They're just locked.",
    storyIntro:
      "We went through the university's public room-booking calendar for a whole semester. On a typical Saturday, 58 of its 64 teaching labs were not used at all.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Empty labs, schools without one" },
      {
        id: "b2",
        type: "paragraph",
        text: "Of the 112 public schools within ten miles of campus, **only 41 have a working science lab**. Many students finish middle school without ever using a microscope.",
      },
      { id: "b3", type: "stat", value: "91%", label: "of the university's teaching labs are unused on a typical Saturday", sourceId: "s1" },
      { id: "b4", type: "heading", text: "What we're asking for" },
      {
        id: "b5",
        type: "paragraph",
        text: "Two supervised Saturday sessions a month in at least four labs, with graduate student volunteers and a simple online sign-up for teachers and school clubs.",
      },
      { id: "b6", type: "action", label: "Sign the open-labs letter", url: `${DEMO_DOCS_URL}/open-labs-letter` },
    ],
    sources: [
      { id: "s1", title: "Weekend use of university teaching labs (demo)", url: `${DEMO_DOCS_URL}/columbus-lab-usage` },
      { id: "s2", title: "U.S. National Science Foundation", url: "https://www.nsf.gov/" },
    ],
    adHeadline: "58 science labs. Empty every Saturday.",
    adDescription: "Local students need lab time. The university already has the labs. Help open the doors.",
    ctaText: "See why",
    reach: {
      locations: ["Columbus", "Dublin", "Westerville"],
      ageMin: 22,
      ageMax: 60,
      interests: ["Science", "Education", "Parenting"],
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
      ["sarah", 1000, 25], ["david", 1200, 20], ["ashley", 750, 14], ["chris", 600, 9], ["demo", 50, 4],
    ],
    extraFollowers: ["michael"],
    updates: [["Two departments said yes", "Chemistry and biology agreed to host a first pilot session. Thank you for spreading the word.", 7]],
  },
  {
    slug: "storefront-galleries",
    images: "art-gallery",
    creator: "arts",
    title: "Turn Empty Storefronts Into Small Art Galleries",
    category: "arts_culture",
    creatorName: "Main Street Arts Alliance",
    creatorType: "nonprofit",
    creatorDescription: "Local artists, gallery owners and downtown business owners in Cleveland, Ohio.",
    summary:
      "Downtown had 23 empty storefronts. We asked property owners and the city to let local artists use them as small galleries until new tenants move in.",
    targetAudience: "Residents, artists and downtown property owners in Cleveland, aged 22 to 60.",
    whyItMatters:
      "Dark windows make a street feel abandoned. Art in them brings people back, gives local artists a place to show work, and helps the spaces lease faster.",
    storyHeadline: "A dark window can be a gallery",
    storyIntro:
      "Walk down Main Street and almost every other window is papered over. Each one could be showing work by an artist who lives a few blocks away.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Why it needed help" },
      {
        id: "b2",
        type: "paragraph",
        text: "Owners worried about insurance and cleaning, and **most had never been asked**. Artists had nowhere affordable to show their work downtown.",
      },
      { id: "b3", type: "stat", value: "9 storefronts", label: "turned into rotating galleries during the six-month pilot", sourceId: "s1" },
      { id: "b4", type: "heading", text: "The result" },
      {
        id: "b5",
        type: "paragraph",
        text: "After the campaign ran, nine owners lent their spaces rent-free. 54 local artists have shown work, and three of the storefronts have since signed new tenants.",
      },
    ],
    sources: [
      { id: "s1", title: "Downtown storefront gallery pilot: results (demo)", url: `${DEMO_DOCS_URL}/storefront-gallery-pilot` },
      { id: "s2", title: "National Endowment for the Arts", url: "https://www.arts.gov/" },
    ],
    adHeadline: "23 empty windows. Imagine art in them.",
    adDescription: "Help turn empty downtown storefronts into small galleries for local artists.",
    ctaText: "Read more",
    reach: {
      locations: ["Cleveland"],
      ageMin: 22,
      ageMax: 60,
      interests: ["Arts", "Local news", "Small business"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 65, facebook: 35 },
    },
    durationDays: 14,
    goalDollars: 4500,
    isFeatured: true,
    timeline: "completed",
    publishedDaysAgo: 40,
    fundedDaysAgo: 30,
    contributions: [
      ["michael", 1500, 39], ["jessica", 1200, 36], ["david", 900, 33], ["chris", 800, 31], ["demo", 100, 30],
    ],
    extraFollowers: ["sarah"],
    updates: [
      ["Fully funded in ten days", "Thank you to every backer. Ads start once distribution is prepared.", 30],
      ["Nine galleries are open", "Nine owners have lent their storefronts, and the first shows opened this weekend. Thank you for making this happen.", 12],
    ],
  },
  {
    slug: "refill-stations",
    images: "refill",
    creator: "refill",
    title: "Add More Water Bottle Filling Stations in City",
    category: "health",
    creatorName: "Refill Phoenix",
    creatorType: "community_group",
    creatorDescription: "Residents, nurses and bus riders in Phoenix, Arizona working to make free water easy to find.",
    summary:
      "On a 110°F day, finding free drinking water in central Phoenix is harder than it should be. We're asking the city to add 40 bottle filling stations at bus stops, parks and libraries.",
    targetAudience: "Phoenix residents aged 18 to 55, bus riders, students and outdoor workers.",
    whyItMatters:
      "In extreme heat, a refill a block away can prevent heat illness. Filling stations also cut down on plastic bottles.",
    storyHeadline: "Free water should be a short walk away",
    storyIntro:
      "In June our volunteers mapped every public bottle filling station in central Phoenix. We found twelve that worked, and five that didn't.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "What we found" },
      {
        id: "b2",
        type: "paragraph",
        text: "Only **3 of 19 parks** had a working station, and almost no bus stops had one nearby. People waiting for buses in the afternoon heat had nowhere to refill.",
      },
      { id: "b3", type: "stat", value: "12", label: "working public filling stations in all of central Phoenix", sourceId: "s1" },
      { id: "b4", type: "heading", text: "The plan" },
      {
        id: "b5",
        type: "paragraph",
        text: "Forty new stations at the busiest bus stops, parks and libraries, starting where there's no free water within a ten-minute walk.",
      },
      { id: "b6", type: "action", label: "See the refill map", url: `${DEMO_DOCS_URL}/phoenix-refill-map` },
    ],
    sources: [
      { id: "s1", title: "Public water bottle filling stations in central Phoenix (demo)", url: `${DEMO_DOCS_URL}/phoenix-refill-map` },
      { id: "s2", title: "Centers for Disease Control and Prevention", url: "https://www.cdc.gov/" },
    ],
    adHeadline: "110°F outside. 12 places to refill.",
    adDescription: "Central Phoenix needs more free water. Help bring 40 new filling stations to bus stops and parks.",
    ctaText: "Learn more",
    reach: {
      locations: ["Phoenix", "Tempe"],
      ageMin: 18,
      ageMax: 55,
      interests: ["Health", "Environment", "Local news"],
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
      ["sarah", 2500, 19], ["michael", 1800, 17], ["jessica", 1500, 15], ["david", 1200, 13],
      ["ashley", 1000, 12], ["chris", 900, 11], ["demo", 40, 10], ["sarah", 1460, 9],
    ],
    extraFollowers: [],
    updates: [
      ["Fully funded!", "We reached our goal in twelve days. Ads start once the platform finishes setting up distribution.", 8],
      ["Ads are live", "Our message is now running on Instagram and Facebook across Phoenix and Tempe.", 5],
    ],
  },
  {
    slug: "library-computer-time",
    images: "computer-library",
    creator: "library",
    title: "Give Library Visitors More Free Computer Time",
    category: "community",
    creatorName: "Library Access Coalition",
    creatorType: "nonprofit",
    creatorDescription: "Librarians, job coaches and volunteers who help people get online at Denver's branch libraries.",
    summary:
      "Branch libraries limit free computer time to one hour a day. Many people need longer to finish a job application, a benefits form or homework. We're asking for two-hour sessions.",
    targetAudience: "Denver residents aged 18 to 65, job seekers, students and older adults.",
    whyItMatters:
      "For people without a computer at home, the library is how they apply for jobs and benefits. An hour often runs out before the form is done.",
    storyHeadline: "The form takes longer than the hour",
    storyIntro:
      "We asked 420 people using library computers what they were working on, and whether the time was enough. Most told us it wasn't.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Who runs out of time" },
      {
        id: "b2",
        type: "paragraph",
        text: "Nearly half were applying for a job or benefits, and **more than half had no computer at home**. When the hour ends, unsaved work is lost.",
      },
      { id: "b3", type: "stat", value: "6 in 10", label: "library computer users said one hour a day wasn't enough", sourceId: "s1" },
      { id: "b4", type: "heading", text: "A simple change" },
      {
        id: "b5",
        type: "paragraph",
        text: "Raise the daily limit to two hours, and add computers at the four busiest branches so waits stay short.",
      },
      { id: "b6", type: "action", label: "Read the survey", url: `${DEMO_DOCS_URL}/denver-library-computer-survey` },
    ],
    sources: [
      { id: "s1", title: "Library computer users: how much time do people need? (demo)", url: `${DEMO_DOCS_URL}/denver-library-computer-survey` },
      { id: "s2", title: "American Library Association", url: "https://www.ala.org/" },
    ],
    adHeadline: "One hour isn't enough to apply for a job",
    adDescription: "Back two-hour computer sessions at Denver's branch libraries.",
    ctaText: "Learn more",
    reach: {
      locations: ["Denver", "Aurora"],
      ageMin: 18,
      ageMax: 65,
      interests: ["Education", "Books", "Jobs"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 60, instagram: 40 },
    },
    durationDays: 30,
    goalDollars: 6000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 2,
    deadlineInDays: 28,
    contributions: [["michael", 400, 1.5], ["ashley", 250, 1], ["jessica", 200, 0.6], ["demo", 25, 0.3]],
    extraFollowers: ["david"],
    updates: [],
  },
  {
    slug: "food-truck-permits",
    images: "food-truck",
    creator: "trucks",
    title: "Let Food Trucks Apply for Permits Online",
    category: "business",
    creatorName: "Rose City Food Truck Association",
    creatorType: "business",
    creatorDescription: "An association of 86 food truck owners in Portland, Oregon.",
    summary:
      "Food truck owners had to apply for city permits in person, on paper, during weekday office hours. We asked the city to let them apply and renew online.",
    targetAudience: "Portland residents who eat at food trucks, aged 20 to 50, and small business owners.",
    whyItMatters:
      "Every trip to a permit office is a day a truck isn't selling. An online form saves owners time and money, and keeps more trucks on the street.",
    storyHeadline: "Three office visits for one permit",
    storyIntro:
      "We asked our members how they apply for their permits. The answer was the same almost every time: in person, on paper, and more than once.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Why it needed to change" },
      {
        id: "b2",
        type: "paragraph",
        text: "Owners told us they lose several days of sales a year to permit visits. **94% said they would apply online** if they could.",
      },
      { id: "b3", type: "stat", value: "3 visits", label: "to a city office, on average, to get one food truck permit", sourceId: "s1" },
      { id: "b4", type: "heading", text: "The result" },
      {
        id: "b5",
        type: "paragraph",
        text: "After the campaign ran, the city added an online permit form with a status tracker. Paper applications are still accepted for anyone who prefers them.",
      },
    ],
    sources: [
      { id: "s1", title: "Food truck permit applications: owner survey (demo)", url: `${DEMO_DOCS_URL}/portland-food-truck-permits` },
      { id: "s2", title: "U.S. Small Business Administration", url: "https://www.sba.gov/" },
    ],
    adHeadline: "Your favorite food truck lost a day to paperwork",
    adDescription: "Help Portland's food trucks apply for permits online instead of in line.",
    ctaText: "Read more",
    reach: {
      locations: ["Portland"],
      ageMin: 20,
      ageMax: 50,
      interests: ["Food", "Small business", "Local news"],
      channels: ["instagram", "facebook"],
      budgetSplit: { instagram: 60, facebook: 40 },
    },
    durationDays: 14,
    goalDollars: 3500,
    isFeatured: false,
    timeline: "completed",
    publishedDaysAgo: 50,
    fundedDaysAgo: 41,
    contributions: [["jessica", 1200, 48], ["sarah", 900, 46], ["michael", 700, 44], ["demo", 30, 43], ["ashley", 820, 42]],
    extraFollowers: ["chris"],
    updates: [
      ["Funded in nine days", "Thank you! Ads begin once distribution is set up.", 41],
      ["The online form is live", "The city launched online permit applications this week. Thank you for helping make it happen.", 30],
    ],
  },
  {
    slug: "city-budget-ideas",
    images: "city-budget",
    creator: "michael",
    title: "Let Residents Suggest Ideas for the City Budget",
    category: "economic_policy",
    creatorName: "Michael Brown",
    creatorType: "individual",
    creatorDescription: "Bus rider, parent and neighborhood association volunteer in Minneapolis, Minnesota.",
    summary:
      "The city spends over a billion dollars a year, but residents get three minutes at a single public hearing to comment. We want a simple online form where anyone can suggest ideas for the budget.",
    targetAudience: "Minneapolis residents aged 20 to 65, especially parents, shift workers and renters.",
    whyItMatters:
      "People who use the parks, buses and libraries every day know what needs fixing. Most of them can't make a weekday evening hearing.",
    storyHeadline: "Three minutes to comment on a billion dollars",
    storyIntro:
      "Right now the only way to weigh in on the city budget is a three-minute slot at a public hearing on a weekday evening. Most residents have never been to one.",
    storyBlocks: [
      { id: "b1", type: "heading", text: "Who gets left out" },
      {
        id: "b2",
        type: "paragraph",
        text: "Parents, shift workers and people without a car told us **they would share ideas if it didn't mean a night at City Hall**.",
      },
      { id: "b3", type: "stat", value: "8 in 10", label: "residents surveyed have never attended a city budget hearing", sourceId: "s1" },
      { id: "b4", type: "heading", text: "What we're asking for" },
      {
        id: "b5",
        type: "paragraph",
        text: "An online suggestion form open for six weeks before each budget is drafted, with every idea published and a short reply from the city on the most popular ones.",
      },
      { id: "b6", type: "action", label: "Read the survey", url: `${DEMO_DOCS_URL}/minneapolis-budget-survey` },
    ],
    sources: [
      { id: "s1", title: "Who takes part in the city budget? Resident survey (demo)", url: `${DEMO_DOCS_URL}/minneapolis-budget-survey` },
      { id: "s2", title: "Participatory Budgeting Project", url: "https://www.participatorybudgeting.org/" },
    ],
    adHeadline: "A billion-dollar budget. Three minutes to speak.",
    adDescription: "Back an online form so every resident can suggest ideas for the city budget.",
    ctaText: "Learn more",
    reach: {
      locations: ["Minneapolis", "Saint Paul"],
      ageMin: 20,
      ageMax: 65,
      interests: ["Local news", "Civic engagement", "Parenting"],
      channels: ["facebook", "instagram"],
      budgetSplit: { facebook: 55, instagram: 45 },
    },
    durationDays: 30,
    goalDollars: 5000,
    isFeatured: false,
    timeline: "funding",
    publishedDaysAgo: 6,
    deadlineInDays: 24,
    contributions: [["jessica", 600, 5], ["david", 450, 4], ["sarah", 300, 2], ["chris", 150, 1]],
    extraFollowers: ["ashley"],
    updates: [["Two council members are listening", "Two council offices asked for our survey results this week. Keep sharing!", 1]],
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const reset = process.argv.includes("--reset");
  const emails = USERS.map((u) => u.email);

  if (reset) {
    const { count } = await prisma.user.deleteMany({ where: { email: { in: [...emails, ...OLD_EMAILS] } } });
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
    const [cover, ad] = await Promise.all([image(s.images, "cover"), image(s.images, "ad")]);
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
  await seedPendingReview(users);
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
  const trees = await prisma.campaign.findUniqueOrThrow({ where: { slug: "school-shade-trees" } });
  const first = await prisma.comment.create({
    data: {
      campaignId: trees.id,
      userId: users.sarah,
      body: "My kids walk the Lamar route every day. There isn't a single tree for three blocks near the school gate.",
      createdAt: daysAgo(9),
    },
  });
  await prisma.comment.create({
    data: {
      campaignId: trees.id,
      userId: users.demo,
      parentId: first.id,
      body: "Thank you for sharing this, Sarah. I've added the city's tree request checklist to the story.",
      createdAt: daysAgo(8),
    },
  });
  await prisma.comment.create({
    data: {
      campaignId: trees.id,
      userId: users.michael,
      body: "Shared with our PTA group. Is there a map of which routes were measured?",
      createdAt: daysAgo(4),
    },
  });

  const feedback: [string, UserKey, "no" | "somewhat" | "yes", "no" | "somewhat" | "yes"][] = [
    ["school-shade-trees", "sarah", "yes", "yes"],
    ["school-shade-trees", "michael", "yes", "somewhat"],
    ["school-shade-trees", "jessica", "somewhat", "yes"],
    ["school-shade-trees", "ashley", "yes", "no"],
    ["open-university-labs", "david", "yes", "somewhat"],
    ["storefront-galleries", "chris", "somewhat", "yes"],
    ["refill-stations", "sarah", "yes", "yes"],
    ["refill-stations", "david", "yes", "somewhat"],
    ["library-computer-time", "ashley", "yes", "yes"],
    ["library-computer-time", "michael", "somewhat", "yes"],
    ["food-truck-permits", "jessica", "yes", "somewhat"],
    ["food-truck-permits", "chris", "somewhat", "somewhat"],
  ];
  for (const [slug, user, visuals, changed] of feedback) {
    const c = await prisma.campaign.findUniqueOrThrow({ where: { slug } });
    await prisma.feedbackResponse.create({
      data: { campaignId: c.id, userId: users[user], visualsAnswer: visuals, changedMindAnswer: changed },
    });
  }
}

/**
 * Campaigns waiting in the admin's review queue, each with the automated pre-screen already done:
 * one that passes and one that isn't an eligible message.
 */
async function seedPendingReview(users: Record<UserKey, string>) {
  const pending: {
    slug: string;
    creator: UserKey;
    images: string;
    hoursAgo: number;
    location: string;
    data: Partial<Prisma.CampaignUncheckedCreateInput>;
    ai: { decision: "approved" | "changes_requested" | "rejected"; summary: string; issues: { field: string; step: number; message: string }[] };
  }[] = [
    {
      slug: "school-lunch-prices",
      creator: "jessica",
      images: "lunch",
      hoursAgo: 0.4,
      location: "Charlotte",
      data: {
        title: "Publish School Lunch Prices in One Simple List",
        category: "economic_policy",
        creatorName: "Jessica Davis",
        creatorType: "individual",
        summary: "Every school in our district posts lunch prices in a different place, and some don't post them at all. Parents want one simple list with every school's prices and how to apply for free or reduced-price meals.",
        whyItMatters: "Families plan their budgets around school meals. Clear prices also help families who qualify for free meals find out how to apply.",
        storyIntro: "This August, parent volunteers checked the website of every school in the district for current lunch prices.",
        storyBlocks: [
          { id: "b1", type: "paragraph", text: "Of 48 schools, only 19 listed their prices on the school website. Seventeen hid them inside PDF menus, and twelve had no price online at all. We're asking the district to publish one page with every school's breakfast and lunch prices and a link to the free and reduced-price meal application." },
          { id: "b2", type: "stat", value: "12 of 48", label: "schools had no lunch price anywhere online", sourceId: "s1" },
        ],
        sources: [
          { id: "s1", title: "Where school lunch prices are published (demo)", url: `${DEMO_DOCS_URL}/school-lunch-price-survey` },
          { id: "s2", title: "USDA: National School Lunch Program", url: "https://www.fns.usda.gov/nslp" },
        ],
        fundingGoalCents: 150_000,
      },
      ai: { decision: "approved", summary: "Your campaign meets the content and advertising rules.", issues: [] },
    },
    {
      slug: "playstation-5",
      creator: "chris",
      images: "ps",
      hoursAgo: 6,
      location: "Dallas",
      data: {
        title: "Help Me Buy a PlayStation 5",
        category: "other",
        creatorName: "Chris Martinez",
        creatorType: "individual",
        summary: "My old console stopped working and I want a PlayStation 5 so I can play the new games online with my friends.",
        whyItMatters: "All my friends have one and I'm missing out on playing with them.",
        storyIntro: "I need a new PS5 and a couple of games.",
        storyBlocks: [{ id: "b1", type: "paragraph", text: "I have saved some money but it isn't enough. Any help to buy the console is appreciated." }],
        sources: [],
        fundingGoalCents: 60_000,
      },
      ai: {
        decision: "rejected",
        summary: "This campaign can't run on the platform.",
        issues: [{ field: "title", step: 1, message: "It asks for money for a personal purchase. Campaigns need a message or cause that matters to other people." }],
      },
    },
  ];

  for (const c of pending) {
    const [cover, ad] = await Promise.all([image(c.images, "cover"), image(c.images, "ad")]);
    const submitted = new Date(now - c.hoursAgo * 3_600_000);
    await prisma.campaign.create({
      data: {
        ...c.data,
        creatorId: users[c.creator],
        slug: c.slug,
        status: "submitted",
        currentStep: 5,
        coverImageUrl: cover?.url ?? null,
        adAssets: ad ? [{ id: "a1", type: "image", url: ad.url, width: ad.width, height: ad.height }] : [],
        reach: { locations: [c.location], ageMin: 18, ageMax: 65, interests: ["Local news"], channels: ["facebook", "instagram"], budgetSplit: { facebook: 50, instagram: 50 } },
        durationDays: 30,
        rulesAcceptedAt: submitted,
        reachPerDollar: reachPerDollar(c.data.category ?? "other"),
        isDemo: true,
        submittedAt: submitted,
        statusChangedAt: submitted,
        createdAt: new Date(submitted.getTime() - DAY),
        aiReview: { ...c.ai, reviewer: "ai", at: new Date(submitted.getTime() + 15_000).toISOString() },
      } as Prisma.CampaignUncheckedCreateInput,
    });
  }
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
      creatorName: "Emily Carter",
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
  const title = (slug: string) => CAMPAIGNS.find((c) => c.slug === slug)!.title;
  const demo = users.demo;
  // People reached so far by the promoting campaign, as its live report shows it
  const refillId = bySlug["refill-stations"];
  const latest = await prisma.distributionMetric.findFirst({ where: { campaignId: refillId }, orderBy: { recordedAt: "desc" } });
  const refillReach = latest
    ? (await prisma.distributionMetric.aggregate({ where: { campaignId: refillId, recordedAt: latest.recordedAt }, _sum: { reach: true } }))._sum.reach ?? 0
    : 0;
  const trees = "school-shade-trees";
  const labs = "open-university-labs";
  const refill = "refill-stations";
  const items: Prisma.NotificationCreateManyInput[] = [
    { key: `approved:${bySlug[trees]}:seed`, type: "campaign_approved", campaignId: bySlug[trees], title: `${title(trees)} is approved and live`, body: "Your campaign is now open for backing. Share it to get your first backers.", ago: 12, read: true },
    { key: `milestone:25:${bySlug[trees]}`, type: "funding_milestone", campaignId: bySlug[trees], title: `${title(trees)} is 25% funded`, body: "$2,500 of $8,000 raised to promote this message.", ago: 10, read: true },
    { key: "contribution-succeeded:seed", type: "contribution_succeeded", campaignId: bySlug[labs], title: `Thank you for backing ${title(labs)}`, body: "Your $50 contribution went through. $40 goes straight into promoting the message.", ago: 4, read: true },
    { key: "comment:seed", type: "new_comment", campaignId: bySlug[trees], title: `New comment on ${title(trees)}`, body: "Michael B.: Shared with our PTA group. Is there a map of which routes were measured?", ago: 4, read: false },
    { key: `milestone:50:${bySlug[trees]}`, type: "funding_milestone", campaignId: bySlug[trees], title: `${title(trees)} is 50% funded`, body: "$4,200 of $8,000 raised to promote this message.", ago: 2, read: false },
    { key: `deadline:${bySlug[labs]}`, type: "deadline_approaching", campaignId: bySlug[labs], title: `2 days left for ${title(labs)}`, body: "30% funded so far. Contributions close when the deadline passes.", ago: 0.2, read: false },
    { key: `report:${bySlug["storefront-galleries"]}`, type: "report_available", campaignId: bySlug["storefront-galleries"], title: `The final report for ${title("storefront-galleries")} is ready`, body: "See funds raised, ad spend, impressions, clicks and people reached.", ago: 22, read: true },
    { key: `report:${bySlug["food-truck-permits"]}`, type: "report_available", campaignId: bySlug["food-truck-permits"], title: `The final report for ${title("food-truck-permits")} is ready`, body: "See funds raised, ad spend, impressions, clicks and people reached.", ago: 33, read: true },
    { key: "contribution-succeeded:seed-refill", type: "contribution_succeeded", campaignId: bySlug[refill], title: `Thank you for backing ${title(refill)}`, body: "Your $40 contribution went through. $32 goes straight into promoting the message.", ago: 10, read: true },
    { key: `promotion:${bySlug[refill]}`, type: "promotion_started", campaignId: bySlug[refill], title: `Ads are now running for ${title(refill)}`, body: "Delivery numbers will appear in the live report as they come in.", ago: 6, read: true },
    { key: `progress:half:${bySlug[refill]}`, type: "distribution_progress", campaignId: bySlug[refill], title: `${title(refill)} has reached about ${refillReach.toLocaleString("en-US")} people`, body: "Measured by the ad platform so far. The promotion is about halfway through its budget.", ago: 1, read: false },
    { key: "contribution-succeeded:seed-library", type: "contribution_succeeded", campaignId: bySlug["library-computer-time"], title: `Thank you for backing ${title("library-computer-time")}`, body: "Your $25 contribution went through. $20 goes straight into promoting the message.", ago: 0.3, read: false },
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
