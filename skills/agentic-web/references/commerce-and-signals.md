# Crawl Signals, Content Rights, WebMCP & Agentic Commerce

Reference guide for AI crawl/usage governance (**IETF `aipref`**, `Content-Signal`, `robots.txt`, **TDMRep**, **RSL**), browser-native tool registration (**WebMCP** `navigator.modelContext`), and agentic commerce/payment protocols (**UCP**, **ACP**, **x402**).

---

## 1. AI Crawl Policy, `Content-Signal`, and IETF `aipref`

Separate **crawl access** (`robots.txt` allow/disallow) from **downstream usage rights** (search indexing vs. real-time RAG/agent inference vs. foundation model training).

### 1.1 Recommended Default Policy for Business, Docs & Client Sites
Most commercial, SaaS, agency, and local-service sites want **maximum visibility in AI search and real-time coding/chat assistants** (`search=yes`, `ai-input=yes`) while **opting out of unpaid foundation-model weight training** (`ai-train=no`), unless the user specifies an open-data or fully closed policy.

### 1.2 `robots.txt` + `Content-Signal` Pattern

```text
User-agent: *
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /.well-known/
Content-Signal: search=yes, ai-input=yes, ai-train=no

# Explicit allow for search & real-time citation/assistant fetchers
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

# Optional: block pure bulk training crawlers when ai-train=no is desired
User-agent: CCBot
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /

Sitemap: https://example.com/sitemap.xml
```

> **Note**: Never `Disallow: /llms.txt` or `Disallow: /.well-known/` for user-triggered or search-grounding agents, or discovery checks will fail.

### 1.3 HTTP `Content-Signal` & Markdown Token Headers
When serving Markdown twins (`/*.md`) or `Accept: text/markdown` responses, attach machine-readable headers aligned with Cloudflare Markdown for Agents and IETF `aipref` attachment drafts (`draft-ietf-aipref-vocab` / `draft-ietf-aipref-attach`):

```http
Content-Type: text/markdown; charset=utf-8
Vary: Accept
Content-Signal: search=yes, ai-input=yes, ai-train=no
x-markdown-tokens: 840
Link: </llms.txt>; rel="describedby"
```

Estimate `x-markdown-tokens` deterministically (`Math.ceil(utf8ByteLength / 4)`) when exact tokenizer counts are unnecessary.

### 1.4 Licensing & Rights Protocols (Optional Publisher Layer)
- **W3C TDMRep (`/.well-known/tdmrep.json`)**: Declares Text and Data Mining reservation (`tdm-reservation: 1` reserves rights under EU DSM Directive Art. 4; `tdm-policy` links to licensing terms).
- **RSL (`rsl.xml` / Really Simple Licensing)**: Machine-readable XML licensing terms linked from `robots.txt` (`License: https://example.com/rsl.xml`) for publishers monetizing training/inference rights.

---

## 2. Browser-Native Agent Actions: WebMCP (`navigator.modelContext`)

When a web application includes interactive client-side tools (pricing/drift calculators, appointment request forms, catalog filters, unit converters), expose typed **WebMCP** tools so in-browser agents invoke deterministic functions instead of brittle DOM clicking.

### 2.1 Feature-Detected Imperative Registration (TypeScript)

Define strict minimal types (zero `any`) and guard execution on `typeof navigator !== "undefined" && "modelContext" in navigator`:

```ts
interface WebMcpToolSchema {
  readonly type: "object";
  readonly properties: Record<string, { readonly type: string; readonly description?: string; readonly enum?: readonly string[] }>;
  readonly required?: readonly string[];
}

interface WebMcpToolDefinition<TInput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: WebMcpToolSchema;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
  };
  execute(input: TInput): Promise<{ content: ReadonlyArray<{ type: "text"; text: string }> }>;
}

interface ModelContextNavigator {
  readonly modelContext?: {
    registerTool<TInput>(tool: WebMcpToolDefinition<TInput>): void;
    unregisterTool?(name: string): void;
  };
}

export function registerWebMcpTool<TInput>(tool: WebMcpToolDefinition<TInput>): () => void {
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as ModelContextNavigator | undefined;
  if (!nav?.modelContext?.registerTool) {
    return () => {};
  }
  nav.modelContext.registerTool(tool);
  return () => {
    nav.modelContext?.unregisterTool?.(tool.name);
  };
}
```

### 2.2 Safety & Trauma-Informed Consent Rules for WebMCP
- Mark calculators, lookups, and search tools with `annotations: { readOnlyHint: true }`.
- Never auto-submit irreversible mutations, payments, or outbound messages without explicit user confirmation in the UI.
- Never expose private session tokens or hidden user state through WebMCP tool return payloads.

---

## 3. Agentic Commerce & Machine Payments (When Applicable)

Enable these layers ONLY on storefronts, paid APIs, or merchant catalogs:

1. **Universal Commerce Protocol (`/.well-known/ucp`)**:
   - Merchant discovery manifest advertising supported catalog, cart, checkout, and fulfillment capabilities for shopping agents.
2. **Agentic Commerce Protocol (ACP)**:
   - Structured product feed + delegated payment token checkout endpoints (such as Stripe Shared Payment Tokens) for conversational checkout flows.
3. **x402 (HTTP `402 Payment Required`)**:
   - For pay-per-request APIs or premium data endpoints, return status `402` with machine-readable payment requirements (network, asset, amount, recipient, facilitator) and verify signed payment payloads before serving the protected resource.
