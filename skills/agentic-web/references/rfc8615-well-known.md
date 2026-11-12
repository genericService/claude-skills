# RFC 8615 Well-Known URIs, MCP v2, A2A v1.0 & Auth Discovery

Primary-source implementation reference for **IETF RFC 8615** (`/.well-known/`), **RFC 8288** (Web Linking), **MCP `2026-07-28` & SEP-2127 Server Cards**, **A2A `v1.0.1` Agent Cards**, **RFC 9727** (`api-catalog`), **RFC 9728** (`oauth-protected-resource`), and **RFC 9116** (`security.txt`).

---

## 1. RFC 8615 Core Protocol Invariants

**RFC 8615** (*Well-Known Uniform Resource Identifiers*, obsoleting RFC 5785) reserves `/.well-known/<segment-nz>` at the origin root (`scheme + host + port`).

1. **Origin-Root Scope & Subdomain Isolation**:
   - Well-known URIs apply strictly to a single HTTP origin (`https://sub.example.com/.well-known/...` never inherits from `https://example.com/.well-known/...`).
   - Do NOT place `/.well-known/` inside arbitrary subdirectories (`/app/.well-known/...` is non-conformant), except where a downstream RFC explicitly defines **path insertion** after `/.well-known/<suffix>` (specifically **RFC 9728** and **RFC 8414**).
2. **Exact Media Types & Sniffing Protection**:
   - Serve over `https` (`200 OK`) with `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: *`.
   - Use each specification's registered media type:
     - `/.well-known/ard.json` & `/.well-known/ai-catalog.json`: `application/ai-catalog+json` (or `application/json`)
     - `<mcp-url>/server-card`: `application/mcp-server-card+json`
     - `/.well-known/agent-card.json`: `application/a2a+json` (or `application/json`) + `A2A-Version: 1.0`
     - `/.well-known/api-catalog`: `application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`
     - `/.well-known/brand.json`, `adagents.json`, `oauth-protected-resource`, `jwks.json`, `ucp`, `acp.json`, `tdmrep.json`: `application/json; charset=utf-8`
     - `/.well-known/security.txt`, `adcp-ownership.txt`: `text/plain; charset=utf-8`
3. **Middleware, SPA Fallback & Bare-Apex Redirect Protection**:
   - Exclude `/.well-known/` from Next.js `proxy.ts` / `middleware.ts`, locale prefixes, auth login redirects, and SPA `/* -> /index.html 200` rewrites. Returning HTML `200 OK` on a `/.well-known/` URI breaks deterministic validators.
   - If your CDN redirects bare apex `example.com` -> `www.example.com`, bypass the redirect for `/.well-known/*` and `/llms.txt` (`not starts_with(http.request.uri.path, "/.well-known/")`) so strict no-redirect resolvers (`adagents.json`, `ucp`) receive `200 OK` directly at the bare domain.

---

## 2. MCP `2026-07-28`, SEP-2127 Server Cards & Official v2 SDKs

Publish MCP discovery endpoints ONLY when the domain operates a real remote HTTP MCP server.

### 2.1 ARD (`/.well-known/ard.json`) & SEP-2127 (`ai-catalog.json` + `<mcp-url>/server-card`)
Per `ards-project/ard-spec` (**ADR-0010**, Chrome Lighthouse 13.5+ `ard-schema` audit) and `modelcontextprotocol/ext-server-card` (**SEP-2127**):
- Do **not** confuse `mcp.json` (**SEP-2633** local client configuration format) with SEP-2127 server discovery, and note that `/.well-known/mcp/server-card` was rejected during SEP-2127 review.
- **ARD vs `ai-catalog` Relationship (`ADR-0010`)**: `ai-catalog` is the minimal provider publishing core referenced by SEP-2127, whereas **Agentic Resource Discovery (`/.well-known/ard.json`, linked via `<link rel="ard">`, HTTP `Link: <...>; rel="ard"`, or `robots.txt` `Agentmap:`)** is the superset manifest audited by Chrome Lighthouse 13.5+ (`ard-schema` flags `/.well-known/ai-catalog.json` alone as `legacyWellKnown`). Publish `/.well-known/ard.json` (and optionally alias `/.well-known/ai-catalog.json` to the same payload) so both Lighthouse `ard-schema` and SEP-2127 clients resolve cleanly:
  ```json
  {
    "specVersion": "1.0",
    "host": {
      "displayName": "Acme Corp AI Services",
      "identifier": "did:web:acme.com"
    },
    "entries": [
      {
        "identifier": "urn:air:acme.com:server:ops",
        "displayName": "Acme Operations MCP Server",
        "type": "application/mcp-server-card+json",
        "url": "https://acme.com/api/mcp/server-card",
        "representativeQueries": [
          "estimate infrastructure assessment fee for 40 hosts",
          "list Acme service offerings"
        ]
      }
    ]
  }
  ```
  - Every `identifier` MUST match `^urn:air:([a-zA-Z0-9.-]+)(?::([a-zA-Z0-9._:-]+))?:([a-zA-Z0-9._-]+)$` (`urn:air:<publisher-domain>:<namespace>:<name>`).
  - Use `type: "application/mcp-server-card+json"` (ADR-0008 deprecated `application/mcp-server+json`) or `"application/a2a-agent-card+json"`.
- **Step 2: Server Card (`GET <mcp-endpoint>/server-card`, `Content-Type: application/mcp-server-card+json`)**:
  Also advertise via `Link: <https://acme.com/api/mcp/server-card>; rel="describedby"; type="application/mcp-server-card+json"` on MCP endpoint responses.
  ```json
  {
    "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    "name": "com.acme/ops-server",
    "title": "Acme Operations MCP Server",
    "description": "Read-only service catalog, pricing estimator, and scheduling tools.",
    "version": "1.2.0",
    "websiteUrl": "https://acme.com",
    "remotes": [
      {
        "type": "streamable-http",
        "url": "https://acme.com/api/mcp"
      }
    ]
  }
  ```
  - **Required fields (`v1/server-card.schema.json`)**:
    - `$schema`: `"https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json"`
    - `name`: Reverse-DNS namespace + slash + name (`^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`, 3 to 200 chars, e.g. `"com.acme/ops-server"`).
    - `description`: Plain text, **1 to 100 characters** (no Markdown formatting).
    - `version`: Version string (`<= 255` chars).
  - **Optional fields**: `title` (`1..100` chars), `websiteUrl`, `repository` (`{ url, source, subfolder?, id? }`), `icons`, `remotes` (`[{ type: "streamable-http" | "sse", url, headers?, variables? }]`), `_meta`.

### 2.2 MCP `2026-07-28` Transport & OAuth 2.1 / CIMD Rules
- **Stateless HTTP Transport (`2026-07-28`)**: Single HTTP `POST` endpoint (`GET`/`DELETE` return `405 Method Not Allowed`; stateful `Mcp-Session-Id` was removed in `2026-07-28`). Supports pre-session `server/discover` JSON-RPC, headers `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, `Mcp-Name`, and Multi-Round Tool Execution (`resultType: "input_required"`).
- **Authorization**: Requires RFC 9728 Protected Resource Metadata (`authorization_servers` >= 1), OAuth 2.1 + PKCE (`S256`), RFC 8707 `resource` audience binding, and **OAuth Client ID Metadata Documents (CIMD)** (`client_id_metadata_document_supported: true`; Dynamic Client Registration RFC 7591 is deprecated).

### 2.3 Official MCP v2 SDKs

#### TypeScript SDK v2 (`@modelcontextprotocol/server@2.4.0`)
```bash
pnpm add @modelcontextprotocol/server @modelcontextprotocol/client zod
# Add @modelcontextprotocol/node for Node http.IncomingMessage adapters
```
```ts
// Web Standard WinterTC Route Handler (Next.js App Router, Cloudflare Workers, Deno, Bun)
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const server = new McpServer({ name: "com.acme/ops-server", version: "1.2.0" });

server.registerTool(
  "estimate_scope",
  {
    title: "Estimate Project Scope",
    description: "Calculates fixed-fee band from host count.",
    inputSchema: z.object({ hosts: z.number().int().min(1) }),
    annotations: { readOnlyHint: true },
  },
  async ({ hosts }) => ({
    content: [{ type: "text", text: JSON.stringify({ hosts, bandUsd: hosts * 250 }) }],
  }),
);

const handler = createMcpHandler(server);
export const POST = (req: Request): Promise<Response> => handler(req);
```

#### Python SDK v2 (`mcp==2.3.0`)
Note: Python SDK v2 renamed v1 `FastMCP` to `MCPServer` (`from mcp.server.mcpserver import MCPServer`).
```bash
uv add "mcp>=2.3.0"
```
```python
from mcp.server.mcpserver import MCPServer

mcp = MCPServer("com.acme/ops-server")

@mcp.tool()
def estimate_scope(hosts: int) -> dict[str, int]:
    """Calculate fixed-fee band from host count."""
    return {"hosts": hosts, "band_usd": hosts * 250}

app = mcp.streamable_http_app(streamable_http_path="/api/mcp", stateless_http=True)
```

---

## 3. A2A `v1.0.1` Agent Discovery (`/.well-known/agent-card.json`) & SDKs

Publish `/.well-known/agent-card.json` (`Content-Type: application/a2a+json`, header `A2A-Version: 1.0`) when hosting an autonomous Agent2Agent (`lf.a2a.v1`) endpoint.

### 3.1 Canonical v1.0.1 `AgentCard` JSON Structure
Key v1.0 breaking changes from v0.3: top-level `url` moved into `supportedInterfaces[]`; `capabilities.stateTransitionHistory` was removed (`extendedAgentCard` added); `security` was renamed to `securityRequirements`; `skills[].tags` is required.

```json
{
  "name": "Acme Quote Agent",
  "description": "Scopes infrastructure assessments and returns structured project estimates.",
  "version": "1.0.0",
  "supportedInterfaces": [
    {
      "url": "https://acme.com/api/a2a/jsonrpc",
      "protocolBinding": "JSONRPC",
      "protocolVersion": "1.0"
    },
    {
      "url": "https://acme.com/api/a2a",
      "protocolBinding": "HTTP+JSON",
      "protocolVersion": "1.0"
    }
  ],
  "provider": {
    "organization": "Acme Corp",
    "url": "https://acme.com"
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "extendedAgentCard": false
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["text/markdown", "application/json"],
  "skills": [
    {
      "id": "scope-assessment",
      "name": "Scope Infrastructure Assessment",
      "description": "Produces a fixed-fee assessment scope from environment counts.",
      "tags": ["infrastructure", "pricing", "scoping"],
      "examples": ["Estimate a health check for 40 VMware hosts across 2 sites"]
    }
  ]
}
```

### 3.2 Official A2A v1.3.0 SDKs
- **TypeScript (`@a2a-js/sdk@1.3.0`)**:
  ```bash
  pnpm add @a2a-js/sdk
  ```
  Exports `AGENT_CARD_PATH` (`".well-known/agent-card.json"`), `DefaultRequestHandler`, `InMemoryTaskStore` (`@a2a-js/sdk/server`), Express middlewares `agentCardHandler`, `jsonRpcHandler`, `restHandler` (`@a2a-js/sdk/server/express`), and `ClientFactory` (`@a2a-js/sdk/client`).
- **Python (`a2a-sdk==1.3.0`)**:
  ```bash
  uv add "a2a-sdk[http-server]>=1.3.0"
  ```
  Exports `AgentCard`, `AgentInterface`, `AgentSkill`, `AgentCapabilities` (`a2a.types`), `add_a2a_routes_to_fastapi` / `create_agent_card_routes` (`a2a.server.routes`), and `create_client` (`a2a.client`).

---

## 4. API Catalog Discovery: `/.well-known/api-catalog` (`RFC 9727`)

**RFC 9727** (June 2025) defines machine-readable API discovery at `/.well-known/api-catalog` using **RFC 9264** JSON Linksets:
- `GET /.well-known/api-catalog` MUST return `200 OK` with `Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`.
- `HEAD /.well-known/api-catalog` MUST return `200 OK` with a `Link` header containing `rel="api-catalog"`.
- Supported link relation keys inside `linkset[]`:
  - `anchor` *(required)*: Base URI of the API endpoint.
  - `service-desc`: Machine-readable specification (`OpenAPI 3.1`, `AsyncAPI`, `GraphQL SDL`).
  - `service-doc`: Human/agent documentation (`text/markdown` or `text/html`).
  - `service-meta`: Terms of service or SLA policies.
  - `status`: Health check endpoint (`application/health+json` or `application/json`).
  - `item` (for lightweight publisher-only catalogs) and nested `api-catalog`.

---

## 5. OAuth 2.0 Protected Resource Metadata (`RFC 9728`)

**RFC 9728** (April 2025) enables zero-config auth discovery for MCP servers, A2A agents, and HTTP APIs.

### Critical Path-Insertion Rule (`RFC 9728` Section 3.1)
Insert `/.well-known/oauth-protected-resource` **between the authority (host:port) and the resource path** (never append it to the end of a subpath!):

| Protected Resource Identifier (`resource`) | Required RFC 9728 Well-Known Metadata URL |
| :--- | :--- |
| `https://acme.com` | `https://acme.com/.well-known/oauth-protected-resource` |
| `https://acme.com/api/mcp` | `https://acme.com/.well-known/oauth-protected-resource/api/mcp` |

- On `401 Unauthorized` or `403 Forbidden`, return:
  ```http
  WWW-Authenticate: Bearer resource_metadata="https://acme.com/.well-known/oauth-protected-resource/api/mcp", scope="mcp:tools:read"
  ```
- Validation rules:
  - Returned JSON `"resource"` MUST match the target resource identifier **code-point-for-code-point**.
  - Omit optional array keys instead of setting `[]` or `null` (except `"bearer_methods_supported": []`, which explicitly signals zero bearer token support such as pure mTLS/DPoP).

---

## 6. Vulnerability Disclosure: `/.well-known/security.txt` (`RFC 9116`)

Serve `/.well-known/security.txt` as `Content-Type: text/plain; charset=utf-8`:
- **Required fields**:
  - One or more `Contact:` lines (`mailto:`, `tel:`, or `https://` URI).
  - **Exactly one** `Expires:` line formatted per `RFC 3339` (`2027-06-01T00:00:00Z`), recommended **less than 1 year** in the future. Multiple `Expires:` lines or past timestamps fail `RFC 9116` validation.
- **Strict constraints**:
  - `Preferred-Languages:` may appear **at most once** (comma-separated tags, e.g., `en, es`).
  - `Encryption:` MUST be a URI (`https://.../pgp-key.txt` or `openpgp4fpr:...`), never an inline PGP key block.
  - Recommend including `Canonical: https://example.com/.well-known/security.txt` and signing with an OpenPGP cleartext signature (`RFC 4880`).
