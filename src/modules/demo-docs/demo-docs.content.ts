// Demo documents that the seeded campaigns link to as sources and calls to action.
// They stand in for real reports and petitions, and every page says so.

export type DemoDoc = {
  title: string;
  kind: string; // shown above the title, e.g. "Report summary"
  intro: string;
  sections: { heading: string; body?: string; rows?: [string, string][]; list?: string[] }[];
};

export const DEMO_DOCS: Record<string, DemoDoc> = {
  "pune-school-water-testing-2026": {
    title: "Pune school drinking-water testing drive, spring 2026",
    kind: "Report summary",
    intro:
      "Volunteers sampled drinking-water taps at thirty of Pune's oldest public schools between February and April 2026. Samples were analysed for lead by a certified laboratory.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Schools tested", "30"],
          ["Above the safe limit for lead", "11"],
          ["Within the limit", "19"],
          ["Taps sampled", "142"],
          ["Highest reading", "3.1× the limit"],
        ],
      },
      {
        heading: "What the results point to",
        body: "All eleven schools above the limit draw water through service lines laid before 1985. Schools with replaced lines were all within the limit.",
      },
      {
        heading: "Recommendation",
        body: "Replace the service lines at the eleven schools, and re-test after replacement. The state infrastructure fund covers the cost if each school applies before 31 March.",
      },
    ],
  },
  "apply-checklist": {
    title: "How your school committee can apply for pipe replacement",
    kind: "Checklist",
    intro: "The state infrastructure fund pays for replacing old water service lines in public schools. Each school must apply on its own, before 31 March.",
    sections: [
      {
        heading: "What the committee needs",
        list: [
          "A resolution from the school committee asking for replacement",
          "The school's water test results (the volunteer report is accepted)",
          "A photo of the existing service line or meter, if available",
          "Contact details of the headteacher and one committee member",
        ],
      },
      {
        heading: "Steps",
        list: [
          "Raise it at the next committee meeting and pass the resolution",
          "Fill in the fund's one-page form at the ward office",
          "Attach the test results and submit before 31 March",
          "Keep the receipt number and share it with parents",
        ],
      },
    ],
  },
  "open-air-data": {
    title: "Open-data request: publish Delhi's neighbourhood air-sensor readings",
    kind: "Open letter",
    intro:
      "To the operators of air sensors in Delhi's schools, housing societies and research projects: please publish the readings you already collect, as an open hourly feed.",
    sections: [
      {
        heading: "What we're asking for",
        list: [
          "Hourly PM2.5 and PM10 readings from sensors already installed",
          "Sensor location to the nearest street, not the exact address",
          "An open licence so anyone can build maps and alerts",
        ],
      },
      {
        heading: "Why it matters",
        body: "One city-wide number hides big differences between neighbourhoods. Street-level readings would let families decide when it's safe to be outdoors.",
      },
      {
        heading: "How to add your name",
        body: "In the full version, supporters sign here. In this prototype, signatures aren't collected.",
      },
    ],
  },
  "delhi-sensor-inventory": {
    title: "Delhi neighbourhood air-sensor inventory",
    kind: "Dataset summary",
    intro: "A count of low-cost air sensors known to be running in Delhi and the NCR, compiled by Clean Air Collective volunteers.",
    sections: [
      {
        heading: "Sensors by operator",
        rows: [
          ["Schools", "126"],
          ["Housing societies", "214"],
          ["Research projects", "58"],
          ["Total", "398"],
          ["Publishing readings openly", "17"],
        ],
      },
      {
        heading: "Coverage",
        body: "Sensors are spread across 41 wards. Most report every 5 to 15 minutes, which is enough for an hourly public feed without new hardware.",
      },
    ],
  },
  "adyar-traffic-count": {
    title: "Adyar school-gate traffic count",
    kind: "Survey summary",
    intro: "Parents counted vehicles passing the primary school gate on five school days in July, during the morning and afternoon school runs.",
    sections: [
      {
        heading: "Average per school run (30 minutes)",
        rows: [
          ["Two-wheelers", "612"],
          ["Autos", "148"],
          ["Cars", "203"],
          ["Buses", "21"],
          ["Children crossing", "~350"],
        ],
      },
      {
        heading: "Observations",
        body: "There is no zebra crossing, signal or warden. Parents took turns stopping traffic so children could cross.",
      },
    ],
  },
  "mithi-river-survey": {
    title: "Mithi river bank survey and clean-up log",
    kind: "Volunteer log",
    intro: "Volunteers cleared and weighed waste along a 3 km stretch of the Mithi river over twelve Sunday drives, and marked where it collected.",
    sections: [
      {
        heading: "Twelve drives in numbers",
        rows: [
          ["Riverbank covered", "3 km"],
          ["Waste cleared", "4.2 tonnes"],
          ["Share that was plastic", "About 70%"],
          ["Volunteers (total)", "620"],
          ["Blockage hotspots mapped", "5"],
        ],
      },
      {
        heading: "Upcoming drives",
        list: ["Kurla bridge: first Sunday of April", "Saki Naka: third Sunday of April", "Powai outlet: first Sunday of May", "Mahim creek mouth: third Sunday of May"],
      },
    ],
  },
  "bengaluru-library-survey": {
    title: "Bengaluru branch-library usage survey",
    kind: "Survey summary",
    intro: "Volunteers asked residents near ten branch libraries when they would visit, and counted visitors at closing time over two weeks.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Residents surveyed", "1,240"],
          ["Could only visit after 6 pm", "7 in 10"],
          ["Main reason", "Work or college hours"],
          ["People turned away at closing, per branch per day", "~25"],
        ],
      },
      {
        heading: "Pilot proposal",
        body: "Open ten branches until 9 pm for six months with one librarian and trained volunteers, and publish monthly visitor numbers. End the pilot if evening visits stay low.",
      },
    ],
  },
  "rti-help-desk-survey": {
    title: "Open Gov Forum help-desk visitor survey",
    kind: "Survey summary",
    intro: "Visitors to our free weekend RTI help desks in five cities answered a short survey before getting help.",
    sections: [
      {
        heading: "Who came to the desks",
        rows: [
          ["Visitors surveyed", "860"],
          ["Had never filed an RTI", "6 in 10"],
          ["Didn't know RTIs can be filed online", "7 in 10"],
          ["Most common topic", "Pensions and scholarships"],
        ],
      },
      {
        heading: "How to file",
        list: ["Go to the RTI Online portal", "Choose the ministry or department", "Write your question in plain words", "Pay the ₹10 fee online and keep the registration number"],
      },
    ],
  },
  "street-vending-licences": {
    title: "Hyderabad street-vendor licence survey",
    kind: "Survey summary",
    intro: "Union volunteers spoke to vendors in eight markets across Hyderabad and Secunderabad about licences and evictions.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Vendors surveyed", "520"],
          ["No licence or certificate of vending", "Over half"],
          ["Selling from the same spot for 5+ years", "6 in 10"],
          ["Lost a working day to eviction in the last month", "4 in 10"],
        ],
      },
      {
        heading: "What vendors are asking for",
        body: "Finish the city's vendor survey, publish the list of eligible vendors, and issue certificates of vending as the 2014 law requires.",
      },
    ],
  },
  "warli-schools-pilot": {
    title: "Warli classes in Palghar schools: pilot summary",
    kind: "Pilot summary",
    intro: "Local Warli artists taught weekly painting classes in village schools in Palghar district, paid a fair fee per session.",
    sections: [
      {
        heading: "The pilot",
        rows: [
          ["Schools taking part", "12"],
          ["Artists teaching", "9"],
          ["Children per week", "~480"],
          ["Session length", "90 minutes"],
        ],
      },
      {
        heading: "What changed",
        body: "Several schools now display students' Warli work at their gates, and three artists have taken on apprentices from the classes.",
      },
    ],
  },
  "kochi-grocers-survey": {
    title: "Kochi Traders Association member survey",
    kind: "Survey summary",
    intro: "We asked member shops how they take payments and orders today, and what would help them keep customers.",
    sections: [
      {
        heading: "Results",
        rows: [
          ["Shops surveyed", "214"],
          ["Owner has a smartphone", "8 in 10"],
          ["Take orders on the phone", "3 in 10"],
          ["Accept UPI", "5 in 10"],
        ],
      },
      {
        heading: "Workshop plan",
        list: ["Set up UPI payments with a printed QR code", "Make a WhatsApp catalogue of best sellers", "Offer simple local delivery to regulars"],
      },
    ],
  },
};
