# Ad Context Protocol (AdCP v3.2+) Reference Guide

Authoritative specification guide for **AdCP v3.2+** (governed by AgenticAdvertising.org at https://adcontextprotocol.org and https://docs.adcontextprotocol.org/llms.txt), covering RFC 8615 well-known identity and authorization files, bilateral supply-chain verification, RFC 9421 cryptographic signing, and MCP/A2A agent workflows.

---

## 1. Protocol Architecture Overview

AdCP standardizes how autonomous AI agents represent brands, verify publisher inventory, generate governed creatives, activate audience signals, and execute media buys across MCP (Model Context Protocol) and A2A (Agent-to-Agent Protocol).

| Artifact / Layer | URI / Transport | Owner | Purpose |
| :--- | :--- | :--- | :--- |
| **`brand.json`** | `/.well-known/brand.json` | Brand / Corporate House | Machine-readable brand identity, colors, typography, logos, tone/voice guardrails, portfolio hierarchy, and brand agent pointers |
| **`adagents.json`** | `/.well-known/adagents.json` | Publisher / Data Provider | Agentic successor to `ads.txt` + `sellers.json`; declares properties/signals and authorizes specific AI sales/signal agent URLs |
| **`jwks.json`** | `/.well-known/jwks.json` | Agent / Brand / Publisher | Public cryptographic keys (Ed25519 / ECDSA) for RFC 9421 HTTP Message Signatures and webhook verification |
| **`adcp-ownership.txt`** | `/.well-known/adcp-ownership.txt` | Domain Operator | Domain-control verification challenge during registry onboarding (alongside `authoritative_location?adcp_claim=<token>`) |
| **Planning & Execution** | MCP (`streamable-http`) / A2A | Buyer & Seller Agents | Structured tasks across Media Buy, Creative, Signals, Sponsored Intelligence, and Governance |
| **Trusted Match (TMP)** | Low-latency impression tier | Publisher / SSP / Router | Real-time package activation and privacy-preserving exposure matching (X25519 HPKE `encryption_keys`) |

---

## 2. `/.well-known/brand.json` (AdCP v3.2.10 Schema)

**Canonical Schema URI**: `"https://adcontextprotocol.org/schemas/v3/brand.json"` (or `"https://adcontextprotocol.org/schemas/latest/brand.json"`).

`brand.json` gives coding agents, creative agents, and media-buying agents a strict JSON Schema source of truth for visual identity, tone, logos, and corporate hierarchy instead of unstructured PDFs or prose stuffed into `llms.txt`.

### 2.1 The Five Official `oneOf` Variants

Never mix root properties across mutually exclusive variants. Choose exactly **one** variant:

1. **Variant 1: Hosted Redirect (`authoritative_location`)**
   - Required: `["authoritative_location"]` (must match `^https://`).
   - Optional: `$schema`, `redirect_reason`, `redirect_effective_at`, `note`, `last_updated`.
2. **Variant 2: House Domain Redirect (`house` string/domain redirect)**
   - Points a regional or vanity domain to the corporate house domain.
   - Required: `["house"]`. Optional: `$schema`, `region`, `redirect_reason`, `redirect_effective_at`, `note`, `last_updated`.
3. **Variant 3: MCP Brand Agent Pointer**
   - Brand served dynamically by MCP brand agents (`agents` or `brand_agent`).
   - Properties: `$schema`, `version`, `agents`, `brand_agent`, `contact`, `data_subject_contestation`, `last_updated`.
4. **Variant 4: House Portfolio Document**
   - Corporate parent (`branded_house`, `house_of_brands`, or `hybrid`) governing inline `brands[]` and/or self-published child `brand_refs[]`.
   - Required: `["house"]` (`{ "domain": "acmeinc.com", "name": "Acme Inc.", "architecture": "house_of_brands" }`), plus **at least one** of `brands[]` or `brand_refs[]`.
   - Cross-array invariant: a `brand_id` MUST NOT appear in both `brands[]` and `brand_refs[]`.
5. **Variant 5: Brand Canonical Document (Most Common for Standalone Sites & Client Projects)**
   - Self-published brand identity at `https://<domain>/.well-known/brand.json`.
   - **Required root fields**:
     - `id`: Lowercase alphanumeric and underscores ONLY (`^[a-z0-9_]+$`, for example `"generic_service"`). Hyphens are invalid in `brand_id`.
     - `names`: Non-empty array of single-key locale objects, for example `[{ "en_US": "Generic Service" }]`.
   - **Prohibited root fields in Variant 5**: `house`, `brands`, `brand_refs`, `authorized_operators`, `authoritative_location`, `redirect_reason`, `redirect_effective_at`, `region`, `note`. (Use `house_domain` string if pointing upward to a parent house, which must reciprocate in its `brand_refs[]`).
   - **Key optional fields in Variant 5**:
     - `$schema`, `version` (`"1.0"`), `default_language` (`"en-US"`), `url`, `description`, `tagline`, `industries`, `target_audience`
     - `colors`: `{ primary, secondary, accent, background, text, heading, body, label, border, divider, surface_1, surface_2 }` (6-digit hex codes `#RRGGBB` or structured color objects)
     - `fonts`: `{ primary: "IBM Plex Mono", secondary: "Inter" }` (CSS family string or structured font file object)
     - `logos`: Array of `{ id, url, orientation, background, variant, slots, usage, width, height }` (`url` required; `id` matches `^[a-z0-9][a-z0-9_-]*$`)
     - `tone`: Plain string OR structured `{ voice, attributes: [], dos: [], donts: [] }`
     - `visual_guidelines`: `{ photography, graphic_style, shapes, iconography, composition, border_radius, elevation, spacing, motion, color_constraints, logo_usage_rules, restrictions }`
     - `properties`: Array of `{ type: "website", identifier: "example.com", primary: true }` (`type` and `identifier` required)
     - `privacy_policy_url`, `trademarks`, `voice_synthesis`, `contact`, `last_updated`

### 2.2 Common `brand.json` Anti-Patterns to Reject
- Do **not** invent root keys like `brand_name` or `brand_colors` (blog-post hallucinations that fail AdCP v3.2.10 schema validation; use `id` + `names` and `colors`).
- Do **not** use hyphens in `id` (`"my-brand"` fails `^[a-z0-9_]+$`; use `"my_brand"`).

---

## 3. `/.well-known/adagents.json` (AdCP v3.2.10 Schema)

**Canonical Schema URI**: `"https://adcontextprotocol.org/schemas/v3/adagents.json"`.

Hosted by publishers, media networks, or signal providers at `https://<domain>/.well-known/adagents.json`.

### 3.1 The Two Official `oneOf` Variants

1. **Variant 1: URL Reference Pointer (`authoritative_location`)**
   - Required: `["authoritative_location"]` (`^https://`).
   - Security rules enforced by validators: 5 MB response cap on pointer files, 20 MB cap on dereferenced authoritative files, **zero HTTP redirects allowed** when fetching `authoritative_location`, short timeout, and stale-if-error caching.
2. **Variant 2: Inline Authorization Document**
   - Required: `["authorized_agents"]`.
   - Note on empty array (`"authorized_agents": []`): Valid ONLY when publishing a catalog-only mirror (`properties`, `placements`, `formats`, `catalog_etag`) with zero sales authorization. Validators treat `[]` as "no sales agents authorized", never as "authorize all".
   - Every item in `authorized_agents[]` **MUST** include base fields (`core/authorized-agent-base.json`):
     - `url` *(required, URI)*: Exact MCP or A2A protocol endpoint URL (including path, such as `"https://sales.example.com/mcp"`). Separate MCP and A2A URLs require separate entries.
     - `authorized_for` *(required, string, 1 to 500 chars)*: Human-readable scope summary.
     - `authorization_type` *(required discriminator)*: One of the 6 exact values below:
       1. `"property_ids"` -> requires `property_ids: string[]` (each must match a `property_id` in top-level `properties[]`)
       2. `"property_tags"` -> requires `property_tags: string[]`
       3. `"inline_properties"` -> requires `properties: Property[]`
       4. `"publisher_properties"` -> requires `publisher_properties: [...]` (for networks/managers)
       5. `"signal_ids"` -> requires `signal_ids: string[]`
       6. `"signal_tags"` -> requires `signal_tags: string[]`
     - Optional scoping/security fields on property authorizations: `delegation_type` (`"direct" | "delegated" | "ad_network"`), `exclusive` (boolean), `countries` (`["US", "CA"]`), `collections`, `placement_ids`, `placement_tags`, `effective_from`, `effective_until`, `signing_keys[]`, `encryption_keys[]`, `last_updated`.
   - Every item in top-level `properties[]` (`core/property.json`) requires:
     - `property_type` (for example `"website"`, `"mobile_app"`, `"ctv_app"`, `"audio"`, `"dooh"`, `"newsletter"`)
     - `name` (human-readable title)
     - `identifiers` (non-empty array of `{ "type": "domain", "value": "example.com" }`)
     - `property_id` (required whenever referenced by `authorized_agents[].property_ids`)

---

## 4. Bilateral Trust, RFC 9421 Signing & Upstream AdCP Skills

### 4.1 Two-Sided Supply Chain Verification
Buyer agents never trust a seller agent's self-reported inventory claim alone:
1. Seller agent claims representation of `publisher.com` (via `list_authorized_properties` or `brand.json`).
2. Buyer agent fetches `https://publisher.com/.well-known/adagents.json` directly over HTTPS.
3. Buyer canonicalizes the seller's endpoint `url` (host lowercase, default port stripped, path preserved) and verifies an active matching entry in `authorized_agents[]` within `[effective_from, effective_until]`.
4. For mutating tasks (`create_media_buy`, webhooks, brand attestations), requests and webhooks are signed with **RFC 9421 HTTP Message Signatures** verified against `signing_keys[]` pinned in `adagents.json` or `/.well-known/jwks.json`.

### 4.2 Core AdCP Task Domains (MCP & A2A)
When building an AdCP-compliant buyer, seller, creative, or governance agent, install the official upstream domain skills on demand:

```bash
# Inspect all official AdCP skills:
npx --yes skills add adcontextprotocol/adcp --list

# Install specific task-domain skills as needed:
npx --yes skills add adcontextprotocol/adcp \
  --skill adcp-media-buy \
  --skill adcp-creative \
  --skill adcp-signals \
  --skill adcp-governance \
  --skill adcp-measurement \
  --skill adcp-si \
  --skill call-adcp-agent -y
```

And fetch live AdCP 3.2+ Markdown specs directly via its `llms.txt` index:
- Index: `https://docs.adcontextprotocol.org/llms.txt`
- Current 3.2 index: `https://docs.adcontextprotocol.org/_llms/3-2.md`
