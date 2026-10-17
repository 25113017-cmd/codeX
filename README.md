# API Sentinel — API Testing Tool

**Live deployment:** https://api-testing-tool-cc4776.netlify.app
**Demo video:** _add your link here_ (e.g. YouTube / Loom)

## Team members

| Name | Role |
| ---- | ---- |
| _Add name_ | _e.g. Frontend_ |
| _Add name_ | _e.g. Backend / security_ |
| _Add name_ | _e.g. Design / docs_ |

---

## Problem statement

Developers constantly need to check that an API behaves as expected: does it return the right status code, is it fast enough, and does the JSON contain the fields the frontend depends on? Desktop tools are heavy to install, and browser-based tools run into **CORS** — most APIs don't allow arbitrary websites to call them, so the browser silently blocks the response. Naïvely adding a server-side proxy fixes CORS but opens a serious hole: **SSRF** (server-side request forgery), where attackers use the proxy to reach `localhost`, private networks or cloud metadata endpoints such as `169.254.169.254`.

## Solution

API Sentinel is a browser-based API workbench with a **hardened serverless proxy**:

- Build any GET / POST / PUT / PATCH / DELETE request with headers and a validated JSON body.
- Send it through the proxy (no CORS limits, full response headers) or **directly from the browser** (to see exactly what a frontend would see, with CORS failures explained).
- Inspect status, timing, size, headers and syntax-highlighted JSON.
- Declare expectations — status code, max response time, required JSON field paths with optional expected values — and get honest **PASS / FAIL** results with totals and a pass percentage. A check passes only when it was actually evaluated against a real response and held; failed requests mark every check as **FAIL (not executed)**.

## Features

**Request builder**
- URL bar with HTTP method selector, **Send** (or `Ctrl/⌘ + Enter`) and **Clear**.
- Headers editor: key/value rows with enable toggles, quick-add presets, and masked values for secrets (`Authorization`, `Cookie`, `X-API-Key`, …).
- Body editor: None / JSON / Text, line numbers, live JSON validation with line & column, Format and Minify.
- Settings: timeout (1–20 s) and follow-redirects toggle.
- Copy as cURL (secret header values are redacted).
- URL, headers, JSON body and test configuration are all validated **before** anything is sent.

**Response inspector**
- Status code + text (colour-coded), response time in ms, body size, transport (proxy/browser), redirect count.
- Pretty (highlighted) and Raw JSON views; non-JSON bodies shown as text; binary bodies summarised.
- Full response headers table, redirect chain, and a list of request headers the proxy refused to forward.
- Loading state with a live timer and Cancel button.
- Specific, actionable error states: CORS / network, mixed content, timeout, DNS failure, connection refused, TLS error, blocked destination, unsafe redirect, response too large, proxy unavailable.

**Validation / tests**
- Expected status code, optional maximum response time, and any number of JSON field paths (`user.id`, `items[0].name`, `data["key.with.dots"]`) with an optional expected value.
- Each check shows PASS / FAIL with expected vs actual values; summary shows total, passed, failed and pass percentage.
- Editing checks after a run marks the results stale and lets you re-run them against the same response.

**Samples** — one click loads real requests against JSONPlaceholder, httpbin and example.com, including deliberately failing cases (404, non-JSON page, timeout, and a blocked metadata request that demonstrates the SSRF protection).

## Security model of the proxy

The proxy is a Netlify Function (`netlify/functions/proxy.mts` → `src/server/proxy.ts`).

| Protection | How |
| --- | --- |
| Scheme allow-list | Only `http:` and `https:`; URLs with embedded `user:pass@` are rejected. |
| Private / internal targets | Hostnames like `localhost`, `*.local`, `*.internal`, `metadata.google.internal` are refused. Every IP is checked against loopback, RFC 1918 private, link-local (`169.254.0.0/16`, cloud metadata), CGNAT, multicast, reserved, IPv6 ULA/link-local, NAT64/6to4/Teredo and IPv4-mapped IPv6 ranges (`src/server/net-guard.ts`). |
| DNS rebinding | The IP check runs inside the socket's own DNS lookup, so the address that is validated is the address that is connected to. No connection pooling. |
| Obfuscated IPs | URLs are parsed with the WHATWG parser, so `http://2130706433/` or `http://0x7f.1/` normalise to `127.0.0.1` and are blocked. |
| Redirects | Followed manually (max 5). Each hop is re-validated; HTTPS→HTTP downgrades and non-HTTP targets are refused; `Authorization` and `Cookie` are dropped when the origin changes. |
| Timeouts | A single deadline (default 10 s, max 20 s) covers DNS, connect, redirects and body download. |
| Size limits | Request body ≤ 1 MB; response body ≤ 2 MB **after** decompression (zip-bomb safe). |
| Header hygiene | `Host`, `Content-Length`, hop-by-hop and `X-Forwarded-*` headers are not forwarded; header names/values are validated against CR/LF injection. |
| No secret leakage | Request URLs, headers and bodies are never logged or stored. The only log line is an error class name for unexpected internal errors. |
| Cross-site abuse | Browser calls from other origins are rejected and no CORS headers are sent. |

**Known limitation:** there is no rate limiting. For a public long-running deployment, add Netlify's rate-limiting rules or an API key check in front of the function.

## Technology stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript (strict), Tailwind CSS 4, Radix UI primitives (shadcn/ui), lucide icons, sonner toasts |
| App framework | TanStack Start + TanStack Router, built with Vite |
| Proxy backend | Netlify Functions (Node.js `http`/`https`, `zlib`, `dns`), Zod payload validation |
| Tests | Vitest + Testing Library |
| Hosting | Netlify |

## Setup

Requirements: Node.js 22.13+ (or 24+), pnpm (or npm), and the Netlify CLI for running the proxy locally.

```bash
pnpm install
npx netlify dev        # http://localhost:8888 — app + proxy function together
```

`npm run dev` starts only the Vite app on port 3000; the **Proxy** mode will then show "Proxy unavailable" because the serverless function is not running. Use `netlify dev`, or switch to **Direct** mode.

Other commands:

```bash
pnpm test          # unit tests: JSON paths, assertions, request validation, SSRF guard
pnpm typecheck
pnpm lint
pnpm build
```

### Environment variables

**None are required.** The app has no API keys or secrets of its own; any credentials a user types into the headers editor are sent only to the API they target and are never stored or logged.

### Deploying

Connect the repository to Netlify (or run `netlify deploy --prod`). `netlify.toml` already sets the build command (`vite build`), publish directory (`dist/client`) and security headers; the function in `netlify/functions/` deploys automatically and is served at `/.netlify/functions/proxy`.

## Architecture

```
Browser (React UI)
   │  Proxy mode: POST /.netlify/functions/proxy  { url, method, headers, body, timeoutMs, followRedirects }
   │  Direct mode: fetch(url) straight from the browser (CORS applies)
   ▼
Netlify Function  netlify/functions/proxy.mts
   └─ src/server/proxy.ts   validate payload → validate URL → guarded request (net-guard) →
                            manual redirects → decompress with size cap → JSON envelope
   ▼
Target API
```

Both paths return one normalised `ExecResult` (`src/lib/http-client.ts`). The UI evaluates checks locally with `runChecks` (`src/lib/assertions.ts`) against that real result.

### Main files

| File | Purpose |
| --- | --- |
| `src/routes/index.tsx` | Home route; renders the workbench. |
| `src/routes/__root.tsx` | HTML shell, title/meta, fonts, dark mode. |
| `src/components/sentinel/workbench.tsx` | Page state: draft request, tests, send/cancel/clear, results. |
| `src/components/sentinel/request-panel.tsx` | URL bar and Request panel tabs (Headers, Body, Tests, Settings). |
| `src/components/sentinel/response-panel.tsx` | Response panel: status bar, Body, Headers, Test Results, loading/empty/error states. |
| `src/components/sentinel/test-results.tsx` | PASS/FAIL list and summary statistics. |
| `src/components/sentinel/*-editor.tsx` | Headers, body, tests and settings editors. |
| `src/components/sentinel/json-view.tsx` | Line-numbered, syntax-highlighted code view. |
| `src/lib/request-draft.ts` | Editable request model, pre-send validation, cURL export. |
| `src/lib/http-client.ts` | Sends via proxy or directly; maps every failure to a clear error. |
| `src/lib/assertions.ts` | Test configuration, validation and check evaluation. |
| `src/lib/json-path.ts` | Path parser/resolver for `user.id`, `items[0]`, `["a.b"]`. |
| `src/lib/samples.ts` | One-click sample requests. |
| `src/lib/api-types.ts` | Types and limits shared by browser and proxy. |
| `src/server/proxy.ts` | Proxy implementation and HTTP handler. |
| `src/server/net-guard.ts` | SSRF hostname/IP block lists and guarded DNS lookup. |
| `netlify/functions/proxy.mts` | Netlify Function entry point. |

## Roadmap ideas

- Saved request collections and history (would use Netlify Database).
- Environment variables / `{{baseUrl}}` templating.
- Query-parameter editor and form-data bodies.
- Rate limiting on the proxy.
