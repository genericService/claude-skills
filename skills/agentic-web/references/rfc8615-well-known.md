# RFC 8615 Well-Known URIs & Agent/API Discovery Stack

Technical implementation reference for **IETF RFC 8615** (`/.well-known/`), MCP Server Cards (**SEP-2127**), A2A Agent Cards, **RFC 9727** API Catalogs, **RFC 9728 / RFC 8414** OAuth Discovery, and **RFC 9116** `security.txt`.

---

## 1. RFC 8615 Core Protocol Rules

**RFC 8615** (*Well-Known Uniform Resource Identifiers*, updating RFC 5785) reserves the path prefix `/.well-known/` at the origin root (`https://<host>:<port>/.well-known/<registered-suffix>`) for origin-wide policy and discovery metadata.

### Mandatory Engineering Invariants
1. **Origin-Root Placement**: Well-known URIs live at the origin root (`/.well-known/...`), NOT inside arbitrary subpaths, except where a downstream specification explicitly defines path-appended metadata (for example, RFC 9728 `/.well-known/oauth-protected-resource/<resource-path>` or RFC 8414 issuer paths). For subpath-only sites (such as GitHub Pages project repos), rely on subpath `/<subpath>/llms.txt` instead of unreachable `/.well-known/` files.
2. **HTTPS & Exact Media Types**:
   - Serve over HTTPS (`200 OK`) without login walls or HTML soft-404 wrappers.
   - Return exact `Content-Type` headers:
     - JSON manifests (`brand.json`, `adagents.json`, `mcp.json`, `agent-card.json`, `jwks.json`, `apple-app-site-association`, `assetlinks.json`): `application/json; charset=utf-8`
     - `/.well-known/api-catalog`: `application/linkset+json` (RFC 9264)
     - `/.well-known/security.txt` & `/.well-known/adcp-ownership.txt`: `text/plain; charset=utf-8`
3. **CORS for Browser & IDE Agents**:
   - Emit `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, HEAD, OPTIONS` on all public `/.well-known/*` discovery endpoints so browser-based agents, MCP inspectors, and web validators can read them cross-origin.
4. **Zero Secrets in Public Discovery Files**:
   - Never place API keys, bearer tokens, internal private hostnames, or customer PII in any `/.well-known/` document. Delegate authentication dynamically via `/.well-known/oauth-protected-resource` (RFC 9728).
5. **Framework Routing & Canonical `www` Redirect Trap Prevention**:
   - Next.js (`proxy.ts` / `middleware.ts`, `[locale]`, `[[...slug]]`), TinaCMS, Astro, and SPA fallback rules (`/* /index.html 200`) frequently hijack `/.well-known/*` and return HTML `200 OK`, breaking JSON parsers silently. Always exclude `/.well-known/` from SPA rewrites and auth/locale middleware, and verify responses with `curl -i`.
   - **Apex vs `www` Canonical Redirects**: AdCP registry resolvers query bare DNS hostnames (`https://example.com/.well-known/brand.json` and `adagents.json`). If your CDN redirects bare apex `example.com` -> `www.example.com` (`301`/`308`), configure your Cloudflare Redirect Rule (`not starts_with(http.request.uri.path, "/.well-known/") and http.request.uri.path ne "/llms.txt"`) or edge worker so `/.well-known/*` and `/llms.txt` resolve with `200 OK` directly on the bare apex OR ensure the redirect preserves the exact path cleanly to a `200 OK` JSON endpoint without Cloudflare bot-challenge HTML interstitials.

---

## 2. MCP Server Discovery: `/.well-known/mcp.json` (SEP-2127)

Expose `/.well-known/mcp.json` (and optionally `/.well-known/mcp/server-card.json`) ONLY when the domain operates a real remote HTTP Model Context Protocol server (`streamable-http` or `sse`). Do not publish stub `mcp.json` files pointing to non-existent `/mcp` routes.

### Schema (`https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json`)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json",
  "name": "acme-ops",
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

- **Required fields**: `name` (lowercase kebab-case identifier), `description`, `version` (SemVer), and `remotes` (non-empty array of `{ "type": "streamable-http", "url": "https://..." }`).

---

## 3. Agent-to-Agent Discovery: `/.well-known/agent-card.json` (A2A)

Expose `/.well-known/agent-card.json` (with an optional symlink or alias at `/.well-known/agent.json` for older A2A v0.1 clients) when the origin hosts an autonomous A2A protocol endpoint capable of receiving delegated tasks.

### Canonical A2A Agent Card Structure

```json
{
  "name": "Acme Quote Agent",
  "description": "Scopes infrastructure assessments and returns structured project estimates.",
  "version": "1.0.0",
  "url": "https://acme.com/api/a2a",
  "provider": {
    "organization": "Acme Corp",
    "url": "https://acme.com"
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": false
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

---

## 4. API Discovery: `/.well-known/api-catalog` (RFC 9727)

**RFC 9727** standardizes machine-readable API discovery at `/.well-known/api-catalog` using **RFC 9264** JSON Linksets (`Content-Type: application/linkset+json`). Emit HTTP `Link: </.well-known/api-catalog>; rel="api-catalog"` on API or root responses when public HTTP APIs exist.

### Linkset Structure (`application/linkset+json`)

```json
{
  "linkset": [
    {
      "anchor": "https://acme.com/api/v1",
      "service-desc": [
        {
          "href": "https://acme.com/api/v1/openapi.json",
          "type": "application/vnd.oai.openapi+json;version=3.1"
        }
      ],
      "service-doc": [
        {
          "href": "https://acme.com/docs/api.md",
          "type": "text/markdown"
        }
      ],
      "status": [
        {
          "href": "https://acme.com/api/health",
          "type": "application/json"
        }
      ]
    }
  ]
}
```

---

## 5. Zero-Config Agent Auth: RFC 9728 & RFC 8414

When an MCP server, A2A agent, or REST API requires OAuth 2.1 tokens:

1. **Protected Resource Metadata (`RFC 9728`)**: Host `/.well-known/oauth-protected-resource` (and return `WWW-Authenticate: Bearer resource_metadata="https://acme.com/.well-known/oauth-protected-resource"` on `401 Unauthorized`):
   ```json
   {
     "resource": "https://acme.com/api/mcp",
     "authorization_servers": ["https://auth.acme.com"],
     "scopes_supported": ["mcp:tools:read", "mcp:tools:execute"],
     "bearer_methods_supported": ["header"]
   }
   ```
2. **Authorization Server Metadata (`RFC 8414`)**: Ensure each listed authorization server exposes `/.well-known/oauth-authorization-server` (or `/.well-known/openid-configuration`) with PKCE (`code_challenge_methods_supported: ["S256"]`) and optional dynamic client registration / CIMD support required by modern MCP clients.

---

## 6. Security & Platform Well-Known Hygiene

### 6.1 `/.well-known/security.txt` (RFC 9116)
Every production domain SHOULD publish `/.well-known/security.txt` (`text/plain; charset=utf-8`):
- **Required fields**:
  - `Contact:` (`mailto:security@example.com` or `https://example.com/contact`)
  - `Expires:` (strict ISO 8601 timestamp with timezone offset, such as `2027-11-11T00:00:00.000Z`, typically 6 to 12 months in the future; expired timestamps fail automated audits!)
- **Recommended fields**: `Canonical:` (full HTTPS URL of `/.well-known/security.txt`), `Preferred-Languages: en`, `Policy:`.

### 6.2 Mobile Universal Links & App Links (When Paired with Native Apps)
- **iOS (`/.well-known/apple-app-site-association`)**: Must be served as `Content-Type: application/json` WITHOUT a `.json` file extension and without HTTP redirects.
- **Android (`/.well-known/assetlinks.json`)**: `Content-Type: application/json` declaring `delegate_permission/common.handle_all_urls` and SHA-256 signing certificate fingerprints.
