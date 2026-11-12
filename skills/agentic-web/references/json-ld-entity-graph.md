# JSON-LD 1.1 & Schema.org Entity Graph for Agentic Grounding

Primary-source reference for **W3C JSON-LD 1.1** (`application/ld+json`), **Schema.org** (`v29.x`), **`schema-dts` (`>=2.1.0`)**, **Microsoft `NLWeb`** structured ingestion, and cross-manifest parity with AdCP `/.well-known/brand.json` and `/llms.txt`.

---

## 1. Role of JSON-LD in the 2026 Agentic Web

While `/llms.txt` and `.md` page twins optimize token-efficient prose reading, server-rendered `<script type="application/ld+json">` provides a deterministic **entity graph**:
- **Search & Citation Grounding**: `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, Bing, and Google AI Mode parse Schema.org `@graph` nodes directly to verify organization identity, authorship, dates, service pricing, software capabilities, and stock availability without brittle DOM scraping.
- **`NLWeb` & Structured RAG (`microsoft/NLWeb`)**: NLWeb pipelines ingest Schema.org JSON-LD (and RSS/Atom mapped to Schema.org) directly into vector + entity stores backing `/ask` and `/mcp` endpoints.
- **Cross-Manifest Parity**: Sharing a single TypeScript brand source across `Organization` JSON-LD, `/.well-known/brand.json`, and `/llms.txt` prevents entity drift across search engines, coding agents, and ad/commerce registries.

---

## 2. Core Engineering Rules

### 2.1 Server-Side Rendering (SSR) Only
Headless AI crawlers and Chrome Lighthouse's initial HTML gatherers do **not** reliably wait for client-side React `useEffect` hydration before extracting `<script type="application/ld+json">`. Always render JSON-LD inside **Server Components**, Astro/VitePress SSR templates, or static HTML build output.

### 2.2 Mandatory `\u003c` XSS Serialization Escape
Never pass raw `JSON.stringify(data)` directly into `dangerouslySetInnerHTML`. Any `</script>` or `<!--` sequence inside a CMS field or title prematurely closes the `<script>` element and opens an XSS vector. Escape `<` as `\u003c` (valid JSON per RFC 8259):

```ts
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
```

### 2.3 Canonical `@context` & `@graph` with Fragment `@id` URIs
1. Always use HTTPS `"@context": "https://schema.org"` (never legacy `"http://schema.org"`).
2. Compose multiple entities on a page into a single `<script type="application/ld+json">` using `"@graph": [...]` rather than scattering disconnected `<script>` blocks.
3. Mint stable fragment `@id` URIs on the canonical origin and reference them across pages:
   - `https://example.com/#organization` (`Organization` / `ProfessionalService` / `Corporation`)
   - `https://example.com/#website` (`WebSite`)
   - `https://example.com/#person` (`Person` for founder or principal author)
   - Subpages reference `provider: { "@id": "https://example.com/#organization" }` or `author: { "@id": "https://example.com/#person" }` instead of re-inlining partial copies.

### 2.4 Strict Parity with Visible Content & `brand.json`
- Every claim inside JSON-LD (`price`, `priceRange`, `telephone`, `datePublished`, `dateModified`, `aggregateRating`) MUST match human-visible text on the page and its `.md` twin.
- Keep `Organization.name`, `Organization.url`, `Organization.description`, and `Organization.logo` identical to `/.well-known/brand.json` (`names[0]`, `url`, `description`, `logos[0].url`).

---

## 3. Zero-Runtime Type Safety with `schema-dts` (`>=2.1.0`)

`schema-dts` (`google/schema-dts`) provides complete TypeScript `.d.ts` definitions for Schema.org with **0 bytes** of runtime JavaScript:

```bash
pnpm add -D schema-dts
```

### Next.js App Router Shared `@graph` Builder Pattern

```tsx
// lib/json-ld.ts
import type {
  BreadcrumbList,
  Graph,
  MergeLeafTypes,
  OrganizationLeaf,
  Person,
  ProfessionalServiceLeaf,
  Service,
  SoftwareApplication,
  TechArticle,
  Thing,
  WebSite,
} from "schema-dts";

const SITE_URL = "https://acme.com";

export const ORG_ID = `${SITE_URL}/#organization` as const;
export const WEBSITE_ID = `${SITE_URL}/#website` as const;
export const FOUNDER_ID = `${SITE_URL}/#person` as const;

type OrgServiceEntity = MergeLeafTypes<[OrganizationLeaf, ProfessionalServiceLeaf]>;

export function organizationNode(): OrgServiceEntity {
  return {
    "@type": ["Organization", "ProfessionalService"],
    "@id": ORG_ID,
    name: "Acme Corp",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    description: "Cloud infrastructure engineering and deterministic automation.",
    sameAs: [
      "https://github.com/acme",
      "https://www.linkedin.com/company/acme",
    ],
    knowsAbout: ["Cloud Infrastructure", "Site Reliability Engineering", "Kubernetes"],
  };
}

export function webSiteNode(): WebSite {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: "Acme Corp",
    publisher: { "@id": ORG_ID },
  };
}

export function personNode(): Person {
  return {
    "@type": "Person",
    "@id": FOUNDER_ID,
    name: "Jane Doe",
    url: SITE_URL,
    jobTitle: "Principal Engineer",
    worksFor: { "@id": ORG_ID },
  };
}

export function techArticleNode(input: {
  readonly slug: string;
  readonly headline: string;
  readonly description: string;
  readonly datePublished: string;
  readonly dateModified: string;
}): TechArticle {
  return {
    "@type": "TechArticle",
    "@id": `${SITE_URL}/notes/${input.slug}#article`,
    headline: input.headline,
    description: input.description,
    url: `${SITE_URL}/notes/${input.slug}`,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { "@id": FOUNDER_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: `${SITE_URL}/notes/${input.slug}`,
  };
}

export function webToolNode(input: {
  readonly path: string;
  readonly name: string;
  readonly description: string;
}): SoftwareApplication {
  return {
    "@type": "SoftwareApplication",
    name: input.name,
    description: input.description,
    url: `${SITE_URL}${input.path}`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "All",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    provider: { "@id": ORG_ID },
  };
}

export function breadcrumbNode(
  items: ReadonlyArray<{ readonly name: string; readonly path: string }>,
): BreadcrumbList {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.path.startsWith("http") ? item.path : `${SITE_URL}${item.path}`,
    })),
  };
}

export function buildJsonLdGraph(nodes: readonly Thing[]): string {
  const graph: Graph = {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
```

Render in any Server Component:
```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: buildJsonLdGraph([organizationNode(), webSiteNode()]),
  }}
/>
```

---

## 4. Archetype-to-Schema.org Matrix & Retired Rich Results

### 4.1 High-Signal Active Types by Project Archetype

| Archetype | Root / Layout `@graph` Nodes | Route-Specific `@graph` Nodes |
| :--- | :--- | :--- |
| **1. Brand, Agency, or Local Service** | `Organization` (or `["Organization", "ProfessionalService"]` / `LocalBusiness`), `WebSite`, `Person` | `Service`, `AboutPage`, `ContactPage`, `BreadcrumbList` |
| **2. Docs, Engineering Blog, or SDK** | `Organization`, `WebSite` | `TechArticle` / `Article` / `BlogPosting`, `SoftwareSourceCode`, `BreadcrumbList` |
| **3. Interactive Web Tools / SaaS** | `Organization`, `WebSite` | `SoftwareApplication` / `WebApplication` (pair with WebMCP `document.modelContext`) |
| **4. Media Publisher / Podcast / Video** | `NewsMediaOrganization` / `Organization`, `WebSite` | `NewsArticle`, `VideoObject`, `PodcastEpisode`, `Person` (`author`) |
| **5. Storefront / Merchant Catalog** | `Organization` / `OnlineStore`, `WebSite` | `Product` + `Offer` (`price`, `priceCurrency`, `availability`, `sku`, `gtin`), `AggregateRating` |

### 4.2 Retired & Restricted Google SERP Rich Results (2024-2026)

Google Search Central retired visual SERP rich snippets for the following types. Keeping them causes **no ranking penalty** and LLM/NLWeb parsers can still read their semantic fields, so treat them strictly as optional machine-context annotations rather than SERP rich-result targets:
- **`HowTo`**: Rich results completely removed.
- **`FAQPage`**: Rich results phased out across general commercial sites (still useful when concise Q&A pairs mirror visible page FAQs for direct RAG/LLM extraction).
- **June 2025+ Retirements**: `ClaimReview`, `CourseInfo`, `EstimatedSalary`, `LearningVideo`, `SpecialAnnouncement`, `VehicleListing`, and `PracticeProblem`.
