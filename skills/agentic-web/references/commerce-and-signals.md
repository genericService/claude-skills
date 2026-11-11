# Crawl Rights (`aipref`, `Content-Signal`, `TDMRep`, `RSL`), WebMCP & Agentic Commerce (`UCP`, `ACP`, `x402`)

Primary-source engineering guide for AI crawl/usage governance, browser-native **W3C WebMCP** (`document.modelContext`), and agentic commerce/payment protocols (**UCP `2026-08-25`**, **ACP `2026-04-17`**, and **x402 v2**).

---

## 1. AI Crawl & Usage Rights: IETF `aipref` vs Cloudflare `Content-Signal`

Primary specifications distinguish two complementary header/robots vocabularies. Emit **both** when you want universal interoperability across standards-track IETF parsers and Cloudflare edge tooling:

| Standard | Field / Directive Name | Exact Keys & Allowed Values | Spec Source |
| :--- | :--- | :--- | :--- |
| **IETF `aipref`** | `Content-Usage` (HTTP header & `robots.txt`) | RFC 9651 Structured Field Dictionary using unquoted tokens `y` / `n` ONLY:<br>`bots=y\|n`, `train-ai=y\|n`, `ai-use=y\|n`, `search=y\|n` (`train-genai` is a subtype of `train-ai`) | `draft-ietf-aipref-vocab-08` & `draft-ietf-aipref-attach-05` |
| **Cloudflare Content Signals** | `Content-Signal` (HTTP header & `robots.txt`) | `search=yes\|no`, `ai-input=yes\|no`, `ai-train=yes\|no` | https://contentsignals.org/ |

### 1.1 Dual-Compatible `robots.txt` Pattern
Recommended default for commercial, agency, SaaS, and docs sites (allow search indexing and real-time agent grounding while opting out of unpaid foundation-model training):

```text
User-agent: *
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /.well-known/
Content-Usage: train-ai=n, ai-use=y, search=y
Content-Signal: search=yes, ai-input=yes, ai-train=no

# Path-scoped IETF aipref override example (draft-ietf-aipref-attach-05):
Content-Usage: /open-research/ train-ai=y, ai-use=y, search=y

# Explicit allow for real-time search & user-triggered citation bots
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

# Optional: block bulk training crawlers when train-ai=n / ai-train=no is set
User-agent: CCBot
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /

Sitemap: https://example.com/sitemap.xml
```

### 1.2 HTTP Response Headers on HTML & `.md` Twins
```http
Content-Usage: train-ai=n, ai-use=y, search=y
Content-Signal: search=yes, ai-input=yes, ai-train=no
```

### 1.3 W3C `TDMRep` & `RSL 1.0` (Publisher Rights & Paid Licensing)
- **W3C TDM Reservation Protocol (`/.well-known/tdmrep.json`)**:
  Root JSON **MUST** be a JSON **Array** of rule objects (`tdm-reservation: 1` reserves Text & Data Mining rights under EU DSM Directive Art. 4; `0` permits TDM):
  ```json
  [
    {
      "location": "/",
      "tdm-reservation": 1,
      "tdm-policy": "https://example.com/policies/tdm-policy.json"
    }
  ]
  ```
  HTTP header equivalent: `tdm-reservation: 1` and `tdm-policy: https://example.com/policies/tdm-policy.json`.
- **Really Simple Licensing (`RSL 1.0`, `https://rslstandard.org/rsl`, `application/rsl+xml`)**:
  Link via `robots.txt` (`License: https://example.com/rsl.xml`) or HTTP `Link: <https://example.com/rsl.xml>; rel="license"; type="application/rsl+xml"`:
  ```xml
  <rsl xmlns="https://rslstandard.org/rsl">
    <content url="/" server="https://licensing.example.com">
      <license>
        <permits type="usage">search</permits>
        <prohibits type="usage">ai-train, ai-input</prohibits>
      </license>
    </content>
  </rsl>
  ```

---

## 2. Browser-Native Agent Tools: W3C WebMCP (`document.modelContext`)

**Critical Specification Update (`webmachinelearning/webmcp`, May 2026+)**:
The W3C Web Machine Learning Community Group moved WebMCP from `navigator.modelContext` to **`document.modelContext`** so tool lifecycle binds cleanly to the active `Document` (`[SecureContext]`), replaced `unregisterTool(name)` / `provideContext()` with standard **`AbortSignal`**, and changed `execute(input, client)` to `execute(input, { signal })`. Control cross-frame tool exposure with `Permissions-Policy: tools=(self)`.

### 2.1 Official WebMCP Packages
```bash
# Official W3C WebIDL TypeScript ambient definitions & polyfill:
pnpm add -D webmcp-types
pnpm add @w3c/webmcp-polyfill

# Full MCP-B bridge + React hooks (zod v4):
pnpm add @mcp-b/global @mcp-b/react-webmcp zod
```

### 2.2 Strict TypeScript Registration (`document.modelContext` + Legacy Fallback)
Feature-detect `document.modelContext` first (with a safe fallback for early `navigator.modelContext` browser builds) and clean up via `AbortController`:

```ts
interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
  readonly consequentialHint?: boolean;
  readonly debugging?: boolean;
}

interface WebMcpToolDefinition<TInput extends Record<string, unknown>> {
  /** Must match /^[A-Za-z0-9_.-]{1,128}$/ */
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, { readonly type: string; readonly description?: string; readonly enum?: readonly string[] }>;
    readonly required?: readonly string[];
  };
  readonly annotations?: WebMcpToolAnnotations;
  execute(input: TInput, options?: { readonly signal?: AbortSignal }): Promise<unknown>;
}

interface DocumentModelContext {
  registerTool<TInput extends Record<string, unknown>>(
    tool: WebMcpToolDefinition<TInput>,
    options?: { readonly exposedTo?: "all" | "self"; readonly signal?: AbortSignal },
  ): Promise<undefined>;
}

export function registerDocumentTool<TInput extends Record<string, unknown>>(
  tool: WebMcpToolDefinition<TInput>,
): () => void {
  if (typeof document === "undefined") return () => {};
  const controller = new AbortController();
  const docCtx = (document as unknown as { readonly modelContext?: DocumentModelContext }).modelContext;

  if (docCtx?.registerTool) {
    void docCtx.registerTool(tool, { exposedTo: "all", signal: controller.signal });
    return () => controller.abort();
  }
  return () => {};
}
```

### 2.3 Declarative HTML Form Annotations (`declarative-api-explainer`)
Chrome Lighthouse's `webmcp-form-coverage` audit also inspects declarative HTML form attributes:
```html
<form action="/estimate" method="get" toolname="estimate_project" tooldescription="Calculate baseline project fee band">
  <input name="hosts" type="number" min="1" required toolparamdescription="Number of production servers" />
  <button type="submit">Calculate</button>
</form>
```
Note: Never add `toolautosubmit` to destructive, financial, or outbound communication forms. Set `annotations: { readOnlyHint: true, consequentialHint: false }` on read-only calculators and search filters.

---

## 3. Agentic Commerce & Machine Payments (`UCP`, `ACP`, `x402` v2)

Publish commerce manifests ONLY on real storefronts, merchant catalogs, or metered paid APIs.

### 3.1 Universal Commerce Protocol (`UCP 2026-08-25`, `/.well-known/ucp`)
- **Discovery (`GET /.well-known/ucp`)**: Must return `200 OK` JSON directly with **zero `3xx` redirects**. Root object requires `ucp` (`{ version: "2026-08-25", services: { "dev.ucp.shopping": [...] }, capabilities: {...}, payment_handlers: {...} }`) and `keys` (`JWK[]` for RFC 9421 webhook/order signing).
- **Headers**: `UCP-Agent: profile="https://agent.example/profile"`, `Idempotency-Key` (UUID), `Request-Id`, plus RFC 9421 `Signature` / `Signature-Input` / `Content-Digest`.
- **Official SDKs**:
  - TypeScript: `pnpm add @ucp-js/sdk` (`>=0.5.1`, Zod schemas + `UcpClient`)
  - Python: `uv add ucp-sdk` (`>=0.5.0`, Pydantic v2 models under `ucp_sdk.models.*`)

### 3.2 Agentic Commerce Protocol (`ACP 2026-04-17`, OpenAI + Stripe, `/.well-known/acp.json`)
- **Discovery (`GET /.well-known/acp.json`)**: Advertises `protocol: { name: "acp", version: "2026-04-17", supported_versions: ["2026-04-17"] }`, `api_base_url`, `transports: ["rest"]`, and `capabilities: { services: ["checkout", "orders"], intervention_Capabilities: ["3ds"] }`.
- **Checkout & Delegated Payment**:
  - REST endpoints (`POST /checkout_sessions`, `POST /checkout_sessions/{id}`, `POST /checkout_sessions/{id}/complete`, `POST /checkout_sessions/{id}/cancel`) require `Authorization: Bearer <token>`, `API-Version: 2026-04-17`, and `Idempotency-Key` on every `POST`.
  - Uses Stripe Shared Payment Tokens (`spt_...` / `vt_...`) minted via `POST /agentic_commerce/delegate_payment` with explicit `allowance` (`max_amount`, `currency`, `expires_at`, `merchant_id`, `checkout_session_id`).
  - Webhooks carry `Merchant-Signature: t=<unix_ts>,v1=<hex_hmac_sha256>`.

### 3.3 `x402` v2 Machine Micropayments (`HTTP 402 Payment Required`)
**Critical v2 Protocol Changes (`x402Version: 2`)**:
- Legacy v1 `X-PAYMENT` and `X-PAYMENT-RESPONSE` headers are replaced by Base64-encoded JSON headers:
  1. Server `402` response -> **`PAYMENT-REQUIRED`** header (`{ x402Version: 2, resource: { url, description, mimeType }, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x...", payTo: "0x...", maxTimeoutSeconds: 60 }] }`)
  2. Client retry request -> **`PAYMENT-SIGNATURE`** header
  3. Server `200` settlement response -> **`PAYMENT-RESPONSE`** header
- Networks use **CAIP-2** identifiers (`"eip155:8453"` Base mainnet, `"eip155:84532"` Base Sepolia, `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` Solana mainnet), and `maxAmountRequired` is renamed to `amount` (atomic integer string).

#### Official `x402` v2 SDKs
- **TypeScript (`@x402/*@2.30.0`)**:
  ```bash
  # Next.js / Hono / Express / MCP server or fetch client:
  pnpm add @x402/core @x402/next @x402/evm @x402/fetch @x402/mcp
  ```
  ```ts
  // app/api/premium/route.ts - Next.js App Router pay-per-call endpoint
  import { NextRequest, NextResponse } from "next/server";
  import { withX402 } from "@x402/next";
  import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
  import { ExactEvmScheme } from "@x402/evm/exact/server";

  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" }),
  ).register("eip155:8453", new ExactEvmScheme());

  export const GET = withX402(
    async (_req: NextRequest) => NextResponse.json({ report: "verified telemetry" }),
    {
      accepts: [
        { scheme: "exact", price: "$0.01", network: "eip155:8453", payTo: "0x000000000000000000000000000000000000dEaD" },
      ],
      description: "Metered telemetry snapshot",
      mimeType: "application/json",
    },
    resourceServer,
  );
  ```
- **Python (`x402==2.27.0` on PyPI)**:
  ```bash
  uv add "x402[fastapi,httpx,evm]>=2.27.0"
  ```
  Exports `x402ResourceServer`, `x402Client`, `HTTPFacilitatorClient` (`x402.http`), `fastapi_payment_middleware` (`x402.http.middleware`), `x402HttpxClient` (`x402.http.clients`), and `ExactEvmScheme` / `ExactEvmServerScheme` (`x402.mechanisms.evm.exact`).
