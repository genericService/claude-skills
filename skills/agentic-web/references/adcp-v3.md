# Ad Context Protocol (AdCP v3.2.8 & v3.3-beta) Specification & SDK Guide

Primary-source specification and SDK reference for **AdCP v3.2.8** (governed by AgenticAdvertising.org at https://adcontextprotocol.org, schemas at `https://adcontextprotocol.org/schemas/3.2.8/` and major alias `/schemas/v3/`, docs index `https://docs.adcontextprotocol.org/_llms/3-2.md`) and official TypeScript (`@adcp/sdk`) and Python (`adcp`) SDKs.

---

## 1. 5-Layer Protocol Architecture & Wire Negotiation

| Layer | Scope | Canonical Mechanisms |
| :--- | :--- | :--- |
| **0. Wire & Transport** | Protocol framing | **MCP** (`tools/call`, `Mcp-Session-Id` transport-only and never signed) and **A2A `1.0` / `0.3`** (`SendMessage` / `message/send` with sole `DataPart`). Draft-7 JSON Schemas. |
| **1. Identity & Signing** | Cryptographic & DNS trust | `/.well-known/brand.json`, `/.well-known/adagents.json`, `/.well-known/jwks.json` (`adcp_use` isolation), RFC 9421 (`adcp/request-signing/v1` & `adcp/webhook-signing/v1`), plus 3.3-beta Web Bot Auth (`Signature-Agent`) & `/.well-known/trust.json`. |
| **2. Auth & Accounts** | Commercial principals | OAuth 2.0 + PKCE / Bearer; `AccountRef` (`{ account_id }` XOR natural key `{ brand, operator, currency?, sandbox? }`); `sync_principal` / `get_principal`; AAO Registry. |
| **3. Protocol Semantics** | Envelope, idempotency, errors | Task states (`submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`, `rejected`); RFC 8785 JCS `idempotency_key` (`^[A-Za-z0-9_.:-]{16,255}$`, replay TTL `3600..604800`s); 120 error codes requiring `error.recovery` (`"transient" \| "correctable" \| "terminal"`) and integer `retry_after`. |
| **4. Domain Protocols** | Business workflows | Media Buy (7 compact 3.2 lifecycle tools + 3.x facades), Creative (15 canonical `format_kind` types), Signals, Governance, Sponsored Intelligence (`si`), Trusted Match (`tmp`). |

- **Wire Version Rule**: Payloads declare release-precision `adcp_version` strings (`"3.0"`, `"3.1"`, `"3.2"`), NEVER patch semver (`"3.2.8"` is rejected on wire). `get_adcp_capabilities` negotiates `adcp_major_version: 3` (AdCP 2.x reached EOL on `2026-08-01`).

---

## 2. `/.well-known/brand.json` (`AdCP v3.2.8`)

**Schema URI**: `"https://adcontextprotocol.org/schemas/v3/brand.json"` (or pinned `"https://adcontextprotocol.org/schemas/3.2.8/brand.json"`).
- Initial fetch at `https://<domain>/.well-known/brand.json` allows **at most 3 HTTPS redirects** strictly between bare apex and `www` (`example.com` <-> `www.example.com`) on the same port.
- Dereferencing `authoritative_location` allows **0 HTTP redirects** (`200 OK` required; 256 KiB cap in signing profiles; max 1 hop in signing/governance).

### 2.1 The Five Document Variants
Variants 1, 2, and 3 are mutually exclusive with all others; Variants 4 (House Portfolio) and 5 (Brand Canonical) may stand alone or compose when a house is also a leaf brand:

1. **Variant 1: Hosted Redirect (`authoritative_location`)**:
   - Required: `authoritative_location` (`https://` URI). Optional: `$schema`, `redirect_reason` (`acquisition | divestiture | rebrand | consolidation | regional | legacy | other`), `redirect_effective_at`, `note`.
2. **Variant 2: House Redirect (`house` string)**:
   - Required: `house` (bare lowercase domain string, e.g., `"acmeinc.com"`). Optional: `$schema`, `region` (ISO 3166-1 alpha-2), `redirect_reason`, `redirect_effective_at`, `note`.
3. **Variant 3: Brand Agent Pointer**:
   - Required: `version` (`"1.0"`), `agents` (`[{ type: "brand", url: "https://...", id: "...", jwks_uri?: "https://..." }]`). Optional: `$schema`, `contact`.
4. **Variant 4: House Portfolio**:
   - Required: `version` (`"1.0"`), `house` (`{ domain, name, names?, architecture?: "branded_house" | "house_of_brands" | "hybrid" }`), plus **at least one non-empty** of `brands[]` or `brand_refs[]` (`[{ domain, brand_id, managed_by?, effective_at? }]`).
   - `brand_id` MUST be unique across `brands[]` and `brand_refs[]`. Optional: `authorized_operators[]`, `trademarks[]`, `compliance_policies`, `contact`, `last_updated`.
5. **Variant 5: Brand Canonical Document (Standard for Standalone Brands & Sites)**:
   - **Required root fields**:
     - `version`: `"1.0"`
     - `id`: Lowercase alphanumeric and underscores ONLY (`^[a-z0-9_]+$`, e.g., `"generic_service"`). Hyphens fail validation.
     - `names`: Non-empty array of single-key locale maps (`[{ "en_US": "Generic Service" }]` or `[{ "en": "Generic Service" }]`).
   - **Key optional fields**: `house_domain` (1-hop pointer to parent house), `default_language`, `keller_type` (`master | sub_brand | endorsed | independent`), `url`, `description`, `tagline`, `colors` (`#RRGGBB` strings or `{ light, dark }`), `fonts`, `logos[]` (`url` required), `tone`, `visual_guidelines`, `properties[]` (`{ type, identifier, primary? }`), `agents[]` (`type`: `brand | rights | governance | creative | sales | buying | signals`), `voice_synthesis`, `rights`, `compliance_policies`, `contact`, `last_updated`.
   - Reject hallucinated keys such as `brand_name` or `brand_colors`.

### 2.2 Bilateral Mutual-Assertion Trust Rule
Leaf TLS proves leaf domain control only. A house-brand relationship is trusted ONLY when bilateral: `leaf.house_domain == house.domain` AND `house.brand_refs[]` (or `house.brands[]`) lists `(leaf_domain, brand_id)`, OR verified via signed `verify_brand_claim` JWS (`typ: "adcp-response-payload+jws"`, `adcp_use: "response-signing"`).

---

## 3. `/.well-known/adagents.json` (`AdCP v3.2.8`)

**Schema URI**: `"https://adcontextprotocol.org/schemas/v3/adagents.json"`.
- Initial fetch allows **max 3 HTTPS redirects within the same `eTLD+1`** (Public Suffix List including PRIVATE section).
- `authoritative_location` pointer allows **0 HTTP redirects**, max 1 hop, 5 MB pointer cap, 20 MB dereferenced cap.
- **`ads.txt` `MANAGERDOMAIN` 1-Hop Fallback**: Used ONLY when `/.well-known/adagents.json` returns `404` or S3/CloudFront XML `403 AccessDenied` (takes the last `MANAGERDOMAIN=<mgr>` without `#noagents` in `/ads.txt` and accepts only entries explicitly scoping `publisher_domain`).

### 3.1 `authorized_agents[]` & Companion Selector Matrix
Every entry in `authorized_agents[]` requires `url` (`https://`), `authorized_for` (1 to 500 chars), and `authorization_type` paired with its **exact companion field**:

| `authorization_type` | Mandatory Non-Empty Companion Field | Extra Rules |
| :--- | :--- | :--- |
| `"property_ids"` | `property_ids: string[]` | Every ID must match a `property_id` in top-level `properties[]` |
| `"property_tags"` | `property_tags: string[]` | Matches `tags[]` on top-level `properties[]` |
| `"inline_properties"` | **`properties: Property[]`** | Companion key is `"properties"`, **never** `"inline_properties"`! |
| `"publisher_properties"` | `publisher_properties: Selector[]` | Each selector requires `selection_type`: `"all" \| "by_tag" \| "by_id"`, plus `publisher_domain` XOR `publisher_domains` (`publisher_domains` array forbidden when `selection_type == "by_id"`) |
| `"signal_ids"` | `signal_ids: string[]` | Authorizes specific audience/context signal IDs |
| `"signal_tags"` | `signal_tags: string[]` | Authorizes signals by tag |

- Empty `"authorized_agents": []` is valid ONLY in catalog-only mirrors where at least one of `properties`, `placements`, `formats`, `collections`, or `signals` is non-empty.
- **Domain Matching**: Bare apex `example.com` matches `example.com`, `www.example.com`, and `m.example.com` ONLY; `news.example.com` matches `news.example.com` ONLY; `*.example.com` matches subdomains ONLY (excludes bare apex `example.com`).
- **Inline `signing_keys[]`**: Public JWKs pinned on an `authorized_agents[]` entry **override** operator `jwks_uri` during webhook and delegation verification.

---

## 4. URL Canonicalization & RFC 9421 Signing Profiles

### 4.1 8-Step Agent URL Canonicalization
Used across `adagents.json`, `brand.json`, RFC 9421 `@target-uri`, and TMP:
1. Lowercase scheme (`https://`).
2. Lowercase host + **UTS-46 Nontransitional ToASCII** (`CheckHyphens`, `CheckBidi`, `CheckJoiners`, `UseSTD3ASCIIRules`; in Python use `idna.encode(host, uts46=True, std3_rules=True)` or `adcp.signing.canonicalize_target_uri`, never stdlib `.encode("idna")`), strip at most one trailing dot, reject IPv6 `%25` zone IDs.
3. Strip userinfo / reject malformed authority.
4. Strip default port (`:443` for `https`, `:80` for `http`).
5. Apply RFC 3986 `remove_dot_segments`, **preserving consecutive slashes (`//`)** and trailing slash differences (`/mcp` != `/mcp/`), while empty path on non-empty authority becomes `/`.
6. Uppercase `%XX` hex digits and decode percent-encoded unreserved characters (`ALPHA`, `DIGIT`, `-`, `.`, `_`, `~`).
7. Preserve query string byte-for-byte (including trailing `?`).
8. Strip `#fragment`.

### 4.2 RFC 9421 Request Signing (`3.2`) vs Webhook Signing Binary Split
- **Covered Components (with body)**: `("@method" "@target-uri" "@authority" "content-type" "content-digest")` (never sign `Mcp-Session-Id`).
- **Required Params**: `created`, `expires` (`expires - created <= 300`), `nonce` (>= 16 random bytes Base64URL), `keyid`, `alg` (`"ed25519"` or `"ecdsa-p256-sha256"` IEEE P1363), and `tag`.
- **Critical Encoding Difference**:
  - **AdCP 3.2 Request Signing (`tag="adcp/request-signing/v1"`)**: `Signature` and `Content-Digest` MUST use strict **RFC 8941 `sf-binary`** (`:<standard-padded-base64>:`).
  - **All 3.x Webhook Signing (`tag="adcp/webhook-signing/v1"`) & 3.0/3.1 Legacy Requests**: `Signature` uses **unpadded Base64URL** inside `:...:`.
- **JWKS `adcp_use` Values**: `"request-signing"` (covers both outbound requests and webhooks), `"governance-signing"`, `"response-signing"`, `"attestation-signing"`.

---

## 5. AdCP 3.2 Domain Task Summary

- **Media Buy (7 Compact 3.2 Commercial Lifecycle Tools)**:
  `list_products` (sync wholesale read requiring `cache_scope: "public" | "account"`), `request_proposals`, `refine_proposals`, `decline_proposals`, `buy_products` (direct purchase), `accept_proposal`, `control_media_buy` (optimistic concurrency `revision`).
  3.x Facades remain supported: `get_products`, `create_media_buy` (3.2 returns `media_buy_status`; package `budget` is a bare `number` while `total_budget` is `{ amount, currency }`), `update_media_buy`, `get_media_buys`, `get_media_buy_delivery` (half-open `[start_date, end_date)`), `provide_performance_feedback`.
- **Creative**: 15 canonical `format_kind` schemas (`image`, `html5`, `display_tag`, `image_carousel`, `video_hosted`, `video_vast`, `audio_hosted`, `audio_vast`, `audio_daast`, `sponsored_placement`, plus 5 experimental: `native_in_feed`, `responsive_creative`, `agent_placement`, `seller_rendered_stateful_display`, `coordinated_placements`); tasks `sync_creatives`, `build_creative`, `list_transformers` (`list_creative_formats` is deprecated in 3.2).
- **Signals**: `get_signals` (`cache_scope` mandatory on every response), `activate_signal`.
- **Governance**: `sync_plans`, two-phase `check_governance` (intent check before seller call + execution check before confirmation), property lists, content calibration.
- **Sponsored Intelligence (`si`)**: `si_get_offering` (returns mandatory `sponsored_context`), `si_initiate_session`, `si_send_message`, `si_terminate_session`.
- **Trusted Match (`tmp`)**: Decorrelated `<endpoint>/context` + `<endpoint>/identity` POSTs (< 50 ms) + RFC 9180 HPKE (`X25519` + `ChaCha20-Poly1305`) `TMPX` encrypted exposure tokens.

---

## 6. Official SDKs, CLIs & Upstream Agent Skills

> **SDK Package Rename Alert**: On npm, **`@adcp/sdk`** (`>=16.7.0` stable, `17.0.0-beta.22` beta) replaced `@adcp/client` (deprecated after `6.0.0`). Import per-tool TypeScript types from `@adcp/sdk/types/<kebab-tool>` (e.g., `@adcp/sdk/types/buy-products`) rather than the 45k-line root barrel to keep `tsc` fast.

### 6.1 TypeScript Official SDK (`@adcp/sdk`)
```bash
pnpm add @adcp/sdk
# Live validation, signing keygen, and 3.2.8 compliance storyboards:
pnpm dlx @adcp/sdk resolve https://seller.example.com/mcp --protocol mcp --json
pnpm dlx @adcp/sdk signing generate-key --alg ed25519 --kid agent-req-2026-09 \
  --private-out ./private.jwk.json --public-out ./jwks.json
pnpm dlx @adcp/sdk grade request-signing https://seller.example.com/mcp
pnpm dlx @adcp/sdk storyboard run my-seller --compliance-version 3.2.8 --json --strict-flags
```

```ts
import { ADCPMultiAgentClient, AdagentsJsonSchema, BrandJsonSchema } from "@adcp/sdk";
import { canonicalizeAgentUrl, validateAdAgents } from "@adcp/sdk/discovery";
import { validateBrandDomain } from "@adcp/sdk/brand";
import { createAgentSignedFetch, type SigningKey } from "@adcp/sdk/signing/client";
import type { BuyProductsRequest } from "@adcp/sdk/types/buy-products";

// Validate local or remote brand.json and adagents.json manifests
const canonicalUrl = canonicalizeAgentUrl("HTTPS://Seller.Example.com:443/mcp");
const brandAudit = await validateBrandDomain("example.com");
const adagentsAudit = await validateAdAgents("publisher.example.com");
const validBrand = BrandJsonSchema.parse({
  version: "1.0",
  id: "acme_corp",
  names: [{ en_US: "Acme Corp" }],
});

// Capability-aware RFC 9421 3.2 signed fetch + MCP client
const signingKey: SigningKey = {
  keyid: "buyer-ed25519-2026-09",
  alg: "ed25519",
  privateKey: {
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    adcp_use: "request-signing",
    kid: "buyer-ed25519-2026-09",
    x: process.env.ADCP_PUBLIC_X ?? "",
    d: process.env.ADCP_PRIVATE_D ?? "",
  },
};

const client = new ADCPMultiAgentClient([
  {
    id: "seller",
    name: "Seller MCP",
    agent_uri: canonicalUrl,
    protocol: "mcp",
    auth_token: process.env.ADCP_TOKEN,
    fetch: createAgentSignedFetch({ key: signingKey, agentUrl: canonicalUrl }),
  },
]);

void [brandAudit, adagentsAudit, validBrand, client, null as unknown as BuyProductsRequest];
```

### 6.2 Python Official SDK (`adcp>=9.6.2` on PyPI)
```bash
uv add "adcp>=9.6.2"
# CLI resolution & Ed25519 RFC 9421 key generation:
uvx adcp --resolve https://seller.example.com/mcp --agent-type sales --json
uvx --from adcp adcp-keygen --alg ed25519 --purpose request-signing --out signing-key.pem
```

```python
from adcp import ADCPClient, AgentConfig, Protocol
from adcp.adagents import fetch_adagents, verify_agent_authorization
from adcp.signing import SigningConfig, canonicalize_target_uri, validate_brand_domain

async def verify_supply_chain(publisher_domain: str, raw_agent_url: str) -> bool:
    canon_url = canonicalize_target_uri(raw_agent_url)
    doc = await fetch_adagents(publisher_domain)
    await validate_brand_domain(publisher_domain)
    return verify_agent_authorization(
        doc,
        agent_url=canon_url,
        property_type="website",
        property_identifiers=[{"type": "domain", "value": publisher_domain}],
    )
```

### 6.3 Upstream AdCP Agent Skills (`adcontextprotocol/adcp`)
When building a domain-specific AdCP agent, install upstream skills on demand:
```bash
npx --yes skills add adcontextprotocol/adcp \
  --skill adcp-media-buy \
  --skill adcp-creative \
  --skill adcp-signals \
  --skill adcp-governance \
  --skill adcp-si \
  --skill call-adcp-agent -y
```
