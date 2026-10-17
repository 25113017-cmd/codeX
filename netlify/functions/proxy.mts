import { handleProxyHttpRequest } from '../../src/server/proxy'

// Served at /.netlify/functions/proxy. See src/server/proxy.ts for the SSRF,
// redirect, timeout and size-limit safeguards.
export default async (req: Request) => handleProxyHttpRequest(req)
