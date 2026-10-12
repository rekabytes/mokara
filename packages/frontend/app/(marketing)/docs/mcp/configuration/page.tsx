import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../../DocPage";

export const metadata: Metadata = {
  title: "MCP configuration",
  description:
    "Environment variables, routing and deployment requirements for Mokara’s read-only MCP server and OAuth sign-in.",
};
export default function McpConfigurationPage() {
  return (
    <DocPage
      current="/docs/mcp/configuration"
      title="Ready for connections."
      description="An operator’s reference for enabling MCP sign-in on a Mokara deployment."
    >
      <section aria-labelledby="deploy">
        <h2 id="deploy">Deploy both services</h2>
        <p>
          Deploy the MCP-capable backend and frontend together. The frontend serves public OAuth
          discovery and browser consent; the backend owns authorization, tokens and workspace
          access.
        </p>
        <p>
          Ensure the database migrations <code>20261012090000_mcp_connections</code> and{" "}
          <code>20261012100000_mcp_oauth</code> have run. Mokara’s backend startup applies
          migrations. Keep your existing database, Redis and authentication configuration.
        </p>
      </section>
      <section aria-labelledby="backend">
        <h2 id="backend">Backend environment</h2>
        <p>
          Set the canonical browser-facing frontend origin, with no path or query. The following is
          a staging example:
        </p>
        <pre>
          <code>{"AUTH_PUBLIC_URL=https://dev.mokara.my\nMCP_ALLOWED_ORIGINS="}</code>
        </pre>
        <p>
          Use your deployment’s actual frontend origin. Production requires HTTPS. An invalid or
          missing <code>AUTH_PUBLIC_URL</code> disables MCP OAuth and discovery; manual connections
          remain available.
        </p>
        <p>
          Native agents normally omit the Origin header, so leave <code>MCP_ALLOWED_ORIGINS</code>{" "}
          empty for them. For a browser-based MCP client, allow its exact origin:
        </p>
        <pre>
          <code>{"MCP_ALLOWED_ORIGINS=https://agent.example"}</code>
        </pre>
        <p>
          Use commas for multiple origins. Wildcards and <code>null</code> do not grant access. This
          setting is separate from the browser-session API’s CORS configuration.
        </p>
      </section>
      <section aria-labelledby="frontend">
        <h2 id="frontend">Frontend environment</h2>
        <p>
          Keep <code>BACKEND_URL</code> set to the address the frontend server uses to reach the
          backend. This is an internal runtime value, not a public browser API URL.
        </p>
        <pre>
          <code>{"BACKEND_URL=http://backend-service:4700"}</code>
        </pre>
        <p>
          Replace <code>backend-service</code> with your actual service hostname. Do not add{" "}
          <code>/api</code>. There is no new MCP OAuth client ID or secret to configure. Existing
          Google and GitHub login credentials and callbacks are reused.
        </p>
      </section>
      <section aria-labelledby="ingress">
        <h2 id="ingress">Trusted client-IP forwarding</h2>
        <p>
          If you already use trusted ingress forwarding, preserve the same random{" "}
          <code>AUTH_PROXY_SECRET</code> of at least 32 characters on both backend and frontend.
          Configure the frontend’s <code>AUTH_CLIENT_IP_HEADER</code> for your ingress:
        </p>
        <div className="docs-table-wrap">
          <table>
            <caption>Frontend ingress settings</caption>
            <thead>
              <tr>
                <th scope="col">Ingress</th>
                <th scope="col">Header value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cloudflare</td>
                <td>
                  <code>cf-connecting-ip</code>
                </td>
              </tr>
              <tr>
                <td>A trusted reverse proxy</td>
                <td>
                  <code>x-real-ip</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Only enable forwarding when that ingress overwrites the selected header and direct public
          access to the frontend origin is blocked. Otherwise, leave both forwarding settings empty;
          requests conservatively share the frontend peer’s rate limit. Do not generate a different
          secret on each service.
        </p>
      </section>
      <section aria-labelledby="routing">
        <h2 id="routing">Routing and Cloudflare</h2>
        <p>
          Route <code>/api/*</code> and these public discovery paths through the frontend:
        </p>
        <pre>
          <code>
            {
              "/.well-known/oauth-authorization-server\n/.well-known/oauth-protected-resource\n/.well-known/oauth-protected-resource/api/mcp"
            }
          </code>
        </pre>
        <p>
          Machine requests to MCP, OAuth token/registration endpoints and discovery must not receive
          an interactive browser challenge or a cached response. Keep HTTPS, preserve Authorization
          and MCP protocol headers, and retain protection for unrelated routes.
        </p>
        <p>
          For the staging example above, the agent’s server URL is{" "}
          <code>https://dev.mokara.my/api/mcp</code>. The authorization and token requests must use
          this exact canonical resource URL, rather than the internal backend address.
        </p>
      </section>
      <section aria-labelledby="limits">
        <h2 id="limits">Access and lifecycle</h2>
        <p>
          Mokara grants only <code>mokara:read</code>. Authorization requires PKCE S256 and an
          exactly registered HTTPS or loopback HTTP callback. Access tokens last at most 15 minutes;
          rotating refresh tokens cannot extend the 30-day grant. Reusing an authorization code or a
          used refresh token revokes its grant.
        </p>
        <p>
          Redis is required. OAuth and agent limits fail closed during an outage. A rate-limited
          response includes <code>Retry-After</code>; clients should wait rather than immediately
          retry.
        </p>
        <p>
          There is no automatic database retention job for MCP records. Under your retention policy,
          remove expired or revoked grants before unreferenced client registrations. Keep used token
          hash rows for active grants so replay detection continues to work.
        </p>
      </section>
      <section aria-labelledby="test">
        <h2 id="test">Verify the browser flow</h2>
        <ol>
          <li>Deploy both services and confirm migrations completed.</li>
          <li>
            Add your public <code>/api/mcp</code> URL in a compatible client.
          </li>
          <li>Follow sign-in, review the consent page and approve one workspace.</li>
          <li>Ask the agent to list workspaces and read a task.</li>
          <li>Revoke the connection in Settings and confirm subsequent reads are denied.</li>
        </ol>
        <p>
          See <Link href="/docs/mcp">Connect an AI agent</Link> for member-facing instructions and
          the manual token alternative.
        </p>
      </section>
    </DocPage>
  );
}
