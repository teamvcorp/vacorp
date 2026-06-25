# VA Corp Ecosystem — SEO Backlink Guide

**Purpose:** This file is meant to be dropped into each sibling app's repo. Hand it
to an AI (or a developer) so every VA Corp program site links **back to the hub**
(`https://www.thevacorp.com`) and **cross-links** the other programs. Reciprocal,
descriptive links across the network raise the whole ecosystem's search authority.

---

## The hub

- **VA Corp** — `https://www.thevacorp.com`
  Non-profit advancing equality & sustainability across housing, education, and
  healthcare. This is the **parent organization**; every program is a
  `subOrganization` of it.

## The program sites (cross-link all of these)

| Program          | URL                          | Focus             |
| ---------------- | ---------------------------- | ----------------- |
| Edynsgate        | https://edynsgate.com        | Housing           |
| Homeschool+      | https://homeschool-plus.com  | Education         |
| RallyUp          | https://rallyup.us           | Healthcare        |
| The Good Deed    | https://thegooddeed.net      | Youth Leadership  |
| Spirit of Santa  | https://spiritofsanta.com    | Positive Behavior |
| Grantify         | https://www.getgrantify.com  | Grants & Funding  |

> When editing one program site, link to **VA Corp** + the **other five** programs
> (not itself).

---

## What to add to each site

### 1. A visible footer backlink to the hub

Use descriptive anchor text (not "click here"). Keep it `dofollow` (no
`rel="nofollow"`).

```html
<!-- Footer -->
<p>
  A <a href="https://www.thevacorp.com">VA Corp</a> program — advancing equality
  &amp; sustainability in housing, education, and healthcare.
</p>
```

Next.js / React version:

```tsx
<Link href="https://www.thevacorp.com">VA Corp</Link>
```

### 2. A "Sister Programs" block linking the rest of the network

```html
<nav aria-label="VA Corp programs">
  <a href="https://www.thevacorp.com">VA Corp</a>
  <a href="https://edynsgate.com">Edynsgate — Housing</a>
  <a href="https://homeschool-plus.com">Homeschool+ — Education</a>
  <a href="https://rallyup.us">RallyUp — Healthcare</a>
  <a href="https://thegooddeed.net">The Good Deed — Youth Leadership</a>
  <a href="https://spiritofsanta.com">Spirit of Santa — Positive Behavior</a>
  <a href="https://www.getgrantify.com">Grantify — Grants &amp; Funding</a>
</nav>
```

### 3. JSON-LD structured data (the strongest signal)

Add this `<script>` to each program site's `<head>`. Replace the `@type`, `name`,
and `url` with the current site's values; the `parentOrganization` and `sameAs`
stay the same everywhere so search engines see one connected network.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Edynsgate",
  "url": "https://edynsgate.com",
  "parentOrganization": {
    "@type": "NGO",
    "name": "VA Corp",
    "url": "https://www.thevacorp.com"
  },
  "sameAs": [
    "https://www.thevacorp.com",
    "https://homeschool-plus.com",
    "https://rallyup.us",
    "https://thegooddeed.net",
    "https://spiritofsanta.com",
    "https://www.getgrantify.com"
  ]
}
</script>
```

In **Next.js (App Router)**, render it in `app/layout.tsx`:

```tsx
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Edynsgate", // <- this site
  url: "https://edynsgate.com", // <- this site
  parentOrganization: {
    "@type": "NGO",
    name: "VA Corp",
    url: "https://www.thevacorp.com",
  },
  sameAs: [
    "https://www.thevacorp.com",
    "https://homeschool-plus.com",
    "https://rallyup.us",
    "https://thegooddeed.net",
    "https://spiritofsanta.com",
    "https://www.getgrantify.com",
  ].filter((u) => u !== "https://edynsgate.com"), // drop self
};

// inside <head>:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
/>;
```

---

## Rules of thumb

- **Descriptive anchor text** — use the program name + focus ("RallyUp — Healthcare"),
  never "click here." Vary the wording slightly across sites.
- **Keep links `dofollow`** — do not add `rel="nofollow"` to internal-network links.
- **Use absolute, canonical URLs** — always `https://www.thevacorp.com` (with `www`),
  not bare or `http://`, so link equity isn't split.
- **Reciprocate** — the hub already links out to all six programs; each program
  should link back to the hub and to its siblings.
- **One link is enough per target** — a single clear footer/nav link per site beats
  stuffing the same URL many times.
- **Match the parent/child story** — every program is a `subOrganization` of VA Corp;
  VA Corp lists them as `subOrganization` in its own JSON-LD. Keep that consistent.

## Canonical facts (paste-safe)

- Parent org name: **VA Corp**
- Parent canonical URL: **https://www.thevacorp.com**
- Parent contact: **teamvcorp@thevacorp.com**
- Mission line: *Equality & sustainability in housing, education & healthcare.*
