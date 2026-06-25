// Central site config used for SEO (canonical URLs, sitemap, OG, JSON-LD).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.thevacorp.com"
).replace(/\/$/, "");

export const SITE_NAME = "VA Corp";

export const SITE_TAGLINE =
  "Equality & Sustainability in Housing, Education & Healthcare";

export const SITE_DESCRIPTION =
  "VA Corp is a non-profit educational organization advancing equality and sustainability across housing, education, and healthcare — building living-systems initiatives that regenerate communities and grow future leaders.";

export const CONTACT_EMAIL = "teamvcorp@thevacorp.com";

// Programs/initiatives, surfaced as subOrganizations in structured data.
export const PROGRAMS = [
  { name: "Edynsgate", url: "https://edynsgate.com", focus: "Housing" },
  { name: "Homeschool+", url: "https://homeschool-plus.com", focus: "Education" },
  { name: "RallyUp", url: "https://rallyup.us", focus: "Healthcare" },
  { name: "The Good Deed", url: "https://thegooddeed.net", focus: "Youth Leadership" },
  { name: "Spirit of Santa", url: "https://spiritofsanta.com", focus: "Positive Behavior" },
  { name: "Grantify", url: "https://www.getgrantify.com", focus: "Grants & Funding" },
];
