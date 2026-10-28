// Demo documents that the seeded campaigns link to as sources and calls to action.
// They stand in for real reports and petitions, and every page says so.

export type DemoDoc = {
  title: string;
  kind: string; // shown above the title, e.g. "Report summary"
  intro: string;
  sections: { heading: string; body?: string; rows?: [string, string][]; list?: string[] }[];
};

export const DEMO_DOCS: Record<string, DemoDoc> = {
  "austin-school-routes-heat-survey": {
    title: "Shade on Austin's walking routes to school, summer 2026",
    kind: "Survey summary",
    intro:
      "Parent volunteers walked the twelve busiest routes to six elementary schools in August and September 2026, measuring shade cover and sidewalk temperatures at 3 pm.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Routes measured", "12"],
          ["Average share of route in shade", "18%"],
          ["Longest stretch with no shade", "0.6 miles"],
          ["Hottest sidewalk reading", "131°F"],
          ["Shaded sidewalk on the same day", "94°F"],
        ],
      },
      {
        heading: "What the results point to",
        body: "Routes lined with mature trees were up to 37°F cooler underfoot than open stretches on the same afternoon. The open stretches are mostly along wide arterial roads near school gates.",
      },
      {
        heading: "Recommendation",
        body: "Plant shade trees along the six worst stretches first. The city's free street-tree program covers planting and the first two years of watering when neighbors request it.",
      },
    ],
  },
  "tree-request-checklist": {
    title: "How to request a free street tree on your block",
    kind: "Checklist",
    intro: "The city's street-tree program plants and waters trees for free along public sidewalks. Requests for the spring planting season close at the end of March.",
    sections: [
      {
        heading: "What you need",
        list: [
          "The street address nearest the planting spot",
          "A photo of the sidewalk strip where the tree would go",
          "Agreement from the property owner next to the spot",
          "One neighbor willing to check on the tree in its first summer",
        ],
      },
      {
        heading: "Steps",
        list: [
          "Fill in the city's one-page request form online or at a library",
          "Mention the school route so it is prioritized",
          "Submit before March 31",
          "Share your confirmation number with your school's parent group",
        ],
      },
    ],
  },
  "columbus-lab-usage": {
    title: "Weekend use of university teaching labs",
    kind: "Dataset summary",
    intro: "STEM Bridge volunteers compiled the public room-booking calendar for the university's undergraduate teaching labs over the spring 2026 semester.",
    sections: [
      {
        heading: "Teaching labs by weekend use",
        rows: [
          ["Teaching labs listed", "64"],
          ["Booked on a typical Saturday", "6"],
          ["Unused on a typical Saturday", "58 (91%)"],
          ["Public schools within 10 miles", "112"],
          ["Schools with a working science lab", "41"],
        ],
      },
      {
        heading: "What this means",
        body: "Most teaching labs sit empty on weekends while many nearby schools have no lab of their own. Supervised Saturday sessions would use space that already exists.",
      },
    ],
  },
  "open-labs-letter": {
    title: "Open letter: open university labs to local school groups",
    kind: "Open letter",
    intro: "To the university's leadership: please open teaching labs on Saturdays to public middle- and high-school groups, supervised by graduate student volunteers.",
    sections: [
      {
        heading: "What we're asking for",
        list: [
          "Two Saturday sessions a month in at least four teaching labs",
          "A simple online sign-up for teachers and school clubs",
          "Graduate student volunteers paired with each group",
        ],
      },
      {
        heading: "How to add your name",
        body: "In the full version, supporters sign here. In this prototype, signatures aren't collected.",
      },
    ],
  },
  "storefront-gallery-pilot": {
    title: "Downtown storefront gallery pilot: results",
    kind: "Pilot summary",
    intro: "Main Street Arts Alliance worked with property owners to place rotating local art shows in empty downtown storefronts for six months.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Empty storefronts at the start", "23"],
          ["Storefronts turned into galleries", "9"],
          ["Local artists shown", "54"],
          ["Visitors counted", "11,400"],
          ["Storefronts later leased to new tenants", "3"],
        ],
      },
      {
        heading: "How it works",
        body: "Owners lend the space rent-free until a tenant signs. Artists cover their own shows, and the alliance handles insurance, cleaning and opening hours.",
      },
    ],
  },
  "phoenix-refill-map": {
    title: "Public water bottle filling stations in central Phoenix",
    kind: "Survey summary",
    intro: "Refill Phoenix volunteers mapped every working public bottle filling station in the central city in June 2026.",
    sections: [
      {
        heading: "What we found",
        rows: [
          ["Working stations found", "12"],
          ["Stations out of order", "5"],
          ["Bus stops within 1 block of a station", "4%"],
          ["Parks with a working station", "3 of 19"],
          ["Stations requested in the plan", "40"],
        ],
      },
      {
        heading: "Recommendation",
        body: "Install 40 stations at busy bus stops, parks and libraries, starting with the areas that have none within a 10-minute walk.",
      },
    ],
  },
  "denver-library-computer-survey": {
    title: "Library computer users: how much time do people need?",
    kind: "Survey summary",
    intro: "Library Access Coalition volunteers surveyed 420 people using public computers at eight branch libraries in September 2026.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["People surveyed", "420"],
          ["Said one hour wasn't enough", "6 in 10"],
          ["Were applying for a job or benefits", "47%"],
          ["Had no computer at home", "58%"],
          ["Waited for a free computer", "Average 25 minutes"],
        ],
      },
      {
        heading: "Recommendation",
        body: "Raise the daily limit to two hours, and add more computers at the four busiest branches.",
      },
    ],
  },
  "portland-food-truck-permits": {
    title: "Food truck permit applications: owner survey",
    kind: "Survey summary",
    intro: "The Rose City Food Truck Association surveyed 86 member owners about applying for and renewing their city permits.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Owners surveyed", "86"],
          ["Average office visits per permit", "3"],
          ["Average days of lost sales per year", "4"],
          ["Would apply online if they could", "94%"],
        ],
      },
      {
        heading: "Outcome",
        body: "After the campaign, the city added an online permit form and a status tracker. Paper applications are still accepted.",
      },
    ],
  },
  "minneapolis-budget-survey": {
    title: "Who takes part in the city budget? Resident survey",
    kind: "Survey summary",
    intro: "Volunteers surveyed 610 residents at bus stops, parks and libraries across Minneapolis in September 2026.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Residents surveyed", "610"],
          ["Have never attended a budget hearing", "8 in 10"],
          ["Didn't know hearings were open to the public", "46%"],
          ["Would suggest an idea online", "74%"],
        ],
      },
      {
        heading: "Recommendation",
        body: "Open an online suggestion form for six weeks before each budget is drafted, publish every idea, and reply to the most popular ones.",
      },
    ],
  },
  "school-lunch-price-survey": {
    title: "Where school lunch prices are published",
    kind: "Survey summary",
    intro: "Parent volunteers checked the websites of all 48 schools in the district for current lunch prices in August 2026.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Schools checked", "48"],
          ["Prices listed on the school website", "19"],
          ["Prices only inside a PDF menu", "17"],
          ["No price found online", "12"],
        ],
      },
      {
        heading: "Recommendation",
        body: "Publish one district-wide page listing breakfast and lunch prices for every school, with a link to the free and reduced-price meal application.",
      },
    ],
  },
};
