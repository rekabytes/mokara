import type { Metadata } from "next";
import Link from "next/link";
import { getPublicMetadata } from "@/lib/seo.server";
import { DocPage } from "../DocPage";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/docs/support");
}
export default function SupportIntegrationGuide() {
  return (
    <DocPage
      current="/docs/support"
      title="Your website. Your support inbox."
      description="Add a ticket form to your Help page and receive customer requests in Mokara."
    >
      <section aria-labelledby="setup">
        <h2 id="setup">1. Add your website in Mokara</h2>
        <ol>
          <li>
            Sign in, select the workspace that should receive tickets and open{" "}
            <Link href="/support">Support</Link>.
          </li>
          <li>
            The workspace owner selects <strong>Add website</strong> and enters its name.
          </li>
          <li>
            Add the exact website origins that will embed the form. Include the scheme, hostname and
            port when applicable. Use HTTPS, with no paths, wildcards or trailing slash. HTTP
            localhost origins are supported for local development.
          </li>
          <li>
            Choose an accent color and introduction, leave <strong>Accept new tickets</strong>{" "}
            enabled, then save.
          </li>
          <li>
            Expand the saved website and select <strong>Copy embed</strong>.
          </li>
        </ol>
        <p>
          If your site uses both a bare domain and a www subdomain, add each origin separately. A
          saved website can allow up to ten origins.
        </p>
        <div className="docs-note">
          <p>
            Use the snippet copied from your own workspace. It contains your website’s form URL for
            the current Mokara deployment. No API key, account password or private ticket link
            belongs in your website’s code.
          </p>
        </div>
      </section>
      <section aria-labelledby="embed">
        <h2 id="embed">2. Put the form in your Help page</h2>
        <p>
          For a plain HTML site or a CMS, paste the copied iframe into an HTML/embed block on your
          Help or Contact page. The form opens inline, without adding a chat button.
        </p>
        <p>
          Adjust the iframe’s width and height to suit your page. The copied snippet starts at full
          width, a maximum width of 800 pixels and a height of 1,040 pixels. Smaller screens can
          scroll inside the frame.
        </p>
        <h3>React or Next.js</h3>
        <p>
          Pass the exact <code>src</code> value from the copied snippet as <code>formUrl</code>.
          This component needs no client hook or Mokara SDK:
        </p>
        <pre>
          <code>{`export function SupportTickets({ formUrl }: { formUrl: string }) {
  return (
    <iframe
      src={formUrl}
      title="Submit a support ticket"
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: "100%",
        maxWidth: 800,
        height: 1040,
        border: 0,
        borderRadius: 18,
      }}
    />
  );
}`}</code>
        </pre>
        <p>
          You can also use the copied form URL as a normal link, or place the iframe in a modal that
          your application opens from a <strong>Submit a ticket</strong> button. Keep your existing
          chatbot separate.
        </p>
      </section>
      <section aria-labelledby="domains">
        <h2 id="domains">3. Check domain and browser settings</h2>
        <div className="docs-table-wrap">
          <table>
            <caption>Settings for the iframe integration</caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">What to do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Allowed origins in Mokara</th>
                <td>
                  Add your website’s exact origins under its Support configuration. This controls
                  which sites may embed that form.
                </td>
              </tr>
              <tr>
                <th scope="row">Your website’s Content Security Policy</th>
                <td>
                  If your site has a CSP, allow the origin from the copied form URL in{" "}
                  <code>frame-src</code>. Preserve the rest of your policy and its existing frame
                  sources.
                </td>
              </tr>
              <tr>
                <th scope="row">Mokara CORS</th>
                <td>
                  No customer-domain entries are needed for this iframe integration. Requests inside
                  the form go to Mokara’s same-origin API.
                </td>
              </tr>
              <tr>
                <th scope="row">Storage bucket CORS</th>
                <td>
                  No change is needed. Attachments go through Mokara, rather than directly from your
                  website to the bucket.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          If your policy does not declare <code>frame-src</code>, its fallback rules may still block
          the iframe. Update the policy in your web app, hosting platform or reverse proxy as
          appropriate.
        </p>
        <p>
          Do not add customer websites to Mokara’s global CORS allowlist or enable wildcard CORS to
          fix an embed. Calling the Mokara API directly from your site’s JavaScript is a different
          integration and is not supported by this guide.
        </p>
        <p>
          Only the public ticket form is embeddable. Signed-in Mokara pages and private customer
          ticket pages remain protected from framing. Third-party login cookies are not required.
        </p>
      </section>
      <section aria-labelledby="test">
        <h2 id="test">4. Send a test ticket</h2>
        <ol>
          <li>Open the Help page on one of your allowed website origins, including on mobile.</li>
          <li>
            Submit a request with a working email address and, optionally, a screenshot or PDF.
          </li>
          <li>
            Check the confirmation reference and open <strong>View ticket</strong> in a new tab.
          </li>
          <li>
            Find the request in the chosen workspace’s Support inbox. Refresh the inbox if needed.
          </li>
          <li>
            Send a public reply, check the email update and reply from the customer’s private ticket
            page.
          </li>
        </ol>
        <p>
          Email updates link customers to their ticket page. Replies sent directly to the email
          sender are not collected in this version. Internal notes stay visible only to the
          workspace.
        </p>
      </section>
      <section aria-labelledby="plans">
        <h2 id="plans">Allowances and attachments</h2>
        <div className="docs-table-wrap">
          <table>
            <caption>Shared support allowances per workspace owner</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Websites</th>
                <th scope="col">New tickets / month</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Starter</th>
                <td>1</td>
                <td>100</td>
              </tr>
              <tr>
                <th scope="row">Pro</th>
                <td>3</td>
                <td>500</td>
              </tr>
              <tr>
                <th scope="row">Ultra</th>
                <td>10</td>
                <td>2,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          These allowances are shared across every workspace owned by the account. Creating another
          workspace does not add capacity. Monthly ticket usage resets on the first day of each
          month in UTC. Free does not include new ticket forms; Pro and Ultra are not open for
          signup yet. See <Link href="/pricing">pricing</Link> for plan availability.
        </p>
        <p>
          Each ticket accepts up to three images or PDFs, no larger than 3 MB each. Attachments use
          the workspace owner’s existing shared storage. Reaching the new-ticket allowance does not
          remove existing tickets or stop replies. Pausing a website stops new submissions; paused
          websites still count toward the website allowance.
        </p>
      </section>
      <section aria-labelledby="troubleshooting">
        <h2 id="troubleshooting">If something does not work</h2>
        <dl>
          <dt>
            <strong>The browser refuses to display the frame</strong>
          </dt>
          <dd>
            Check that the current website origin exactly matches an allowed origin in Mokara. Then
            check your website’s CSP permits the form origin. Use the public form URL, rather than
            the inbox or a private ticket page.
          </dd>
          <dt>
            <strong>The form says it is unavailable</strong>
          </dt>
          <dd>
            Check the website is enabled and the owner’s plan includes support tickets. If Mokara
            reports that support is not configured, contact the instance operator.
          </dd>
          <dt>
            <strong>The ticket saved but an attachment failed</strong>
          </dt>
          <dd>
            Use <strong>Retry attachments</strong> on the confirmation screen. The ticket is already
            saved; you do not need to submit another request.
          </dd>
          <dt>
            <strong>The confirmation email has not arrived</strong>
          </dt>
          <dd>
            Check spam and the address used in the form. Keep the private link from the confirmation
            screen. The team can check whether the latest customer email is queued, sent or failed
            in the Support inbox.
          </dd>
          <dt>
            <strong>A private ticket link expired</strong>
          </dt>
          <dd>
            Contact the business. Private links expire after 90 days; a team update after expiry
            sends a renewed link. Keep ticket links private.
          </dd>
        </dl>
      </section>
    </DocPage>
  );
}
