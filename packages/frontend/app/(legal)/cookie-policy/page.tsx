import type { Metadata } from "next";
import {
  Callout,
  Code,
  ContactBlock,
  Internal,
  L,
  LegalDoc,
  LegalTable,
  Mailto,
  P,
  Strong,
  Sub,
  type LegalSection,
} from "@/components/LegalDoc";
import { LEGAL_DOCS, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: LEGAL_DOCS.cookies.description,
};

// The whole policy is verifiable from the code: packages/backend/src/lib/cookies.ts
// sets one cookie with these exact attributes, and the frontend contains no
// localStorage, sessionStorage, IndexedDB, service worker or third-party script.

const SECTIONS: LegalSection[] = [
  {
    id: "at-a-glance",
    title: "At a glance",
    body: (
      <>
        <L
          items={[
            <>
              <Strong>We set one cookie.</Strong> It is called{" "}
              <Code key="mokara_token">mokara_token</Code> — prefixed{" "}
              <Code key="host">__Host-</Code> in production — it keeps you signed in, and it lasts
              seven days.
            </>,
            <>
              <Strong>No analytics, advertising, social or performance cookies.</Strong> No third
              party sets a cookie through our pages, because no third party appears on them.
            </>,
            <>
              <Strong>No cookie consent banner — deliberately.</Strong> The single cookie is
              strictly necessary to provide the feature you asked for, which is the exemption every
              sensible e-privacy regime recognises. Section 4 explains it.
            </>,
            <>
              <Strong>No other storage on your device.</Strong> No <Code>localStorage</Code>, no{" "}
              <Code>sessionStorage</Code>, no IndexedDB, no service worker. Nothing is written to
              your browser except that one cookie.
            </>,
            <>
              If this ever changes — an analytics tool, a preference stored between visits, a
              first-party measurement script — this page gains a row, a consent banner appears
              first, and the date at the top moves.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "what-cookies-are",
    title: "What cookies and similar technologies are",
    body: (
      <P>
        A cookie is a small text file a website asks your browser to store and send back on later
        requests. “Similar technologies” means anything that stores information on, or reads
        information from, your device: <Code>localStorage</Code> and IndexedDB, pixels and tags,
        HTML5 local storage objects, and device fingerprinting. Cookies are not the only thing
        e-privacy law covers, which is why this policy covers the others too — and why the honest
        answer for {OPERATOR.productName} is that none of them are used.
      </P>
    ),
  },
  {
    id: "the-cookie-we-set",
    title: "The cookie we set",
    body: (
      <>
        <LegalTable
          head={["Name", "Type", "Purpose", "Lifespan"]}
          rows={[
            [
              <Code key="mokara_token">mokara_token</Code>,
              "First-party · Strictly necessary (session authentication)",
              "Identifies your signed-in session so the Service does not ask for your password on every click. It holds a signed token, not your password and no other personal data.",
              "7 days from issue",
            ],
          ]}
        />
        <Sub n="3.1">How it is configured, and why</Sub>
        <LegalTable
          head={["Attribute", "Value", "What it protects"]}
          rows={[
            [
              <Code key="HttpOnly">HttpOnly</Code>,
              "set",
              "JavaScript running in the page cannot read it, so an injected script cannot lift your session.",
            ],
            [
              <Code key="SameSite">SameSite</Code>,
              "Lax",
              "It is not sent on cross-site requests, which blocks the ordinary cross-site request-forgery route against your account.",
            ],
            [
              <Code key="Secure">Secure</Code>,
              "set in production",
              "It only ever travels over HTTPS, so it cannot be seen on a plain-text network.",
            ],
            [
              <Code key="Path">Path</Code>,
              "/",
              "Scoped to this site only — it is never sent to any other domain.",
            ],
            [
              <span key="prefix">
                <Code>__Host-</Code> name prefix
              </span>,
              "production only",
              "Browsers refuse to store the cookie at all unless it is marked Secure, scoped to Path=/, and shared with no parent domain — so the guarantees in the rows above are enforced by the browser, not promised by us.",
            ],
            [
              "Signature",
              "HS256, server secret",
              "The token is cryptographically signed with a secret held by the server, so a client cannot forge or extend one.",
            ],
          ]}
        />
        <Sub n="3.2">When it appears and disappears</Sub>
        <L
          items={[
            "Created when you sign up or log in successfully.",
            "Invalidated immediately when you sign out — the cookie is deleted and the token itself is revoked server-side, so a copy captured earlier stops working too.",
            "Expires by itself seven days after it was issued; signing in again issues a fresh one.",
            "Removable by you at any time through your browser’s site-data controls — see section 7.",
          ]}
        />
      </>
    ),
  },
  {
    id: "no-banner",
    title: "Why there is no cookie consent banner",
    body: (
      <>
        <P>
          Consent requirements for cookies apply to storage that is <Strong>not</Strong> strictly
          necessary. {OPERATOR.productName} only uses storage that is strictly necessary, so no
          consent prompt is required. Specifically:
        </P>
        <LegalTable
          head={["Framework", "Position"]}
          rows={[
            [
              "EU ePrivacy Directive 2002/58/EC, Art. 5(3)",
              "Exempt: storage that is technically necessary to provide a service the user explicitly requested. No consent, no banner. (GDPR still governs the personal data in the cookie, which the Privacy Policy covers.)",
            ],
            ["UK Privacy and Electronic Regulations (PECR)", "Same strictly-necessary exemption."],
            [
              "Malaysia",
              "There is no separate cookie or e-privacy statute. The PDPA applies to personal data generally — including any in a cookie — through its notice, consent, security and retention principles. This page and the Privacy Policy together are that notice.",
            ],
            [
              "US state laws, APAC and others",
              "No sale or sharing of personal data for cross-context behavioural advertising takes place, so there is nothing to opt out of. Section 9 covers Do Not Track and Global Privacy Control.",
            ],
          ]}
        />
        <P>
          We are not relying on a generous reading of “strictly necessary” either: the cookie
          authenticates API requests for a service you asked for by logging in. Remove it and the
          product stops working, which is the test the exemption was written for.
        </P>
      </>
    ),
  },
  {
    id: "no-other-storage",
    title: "Other storage on your device: none",
    body: (
      <>
        <P>Checked against the code, item by item:</P>
        <L
          items={[
            <>
              <Code>localStorage</Code> / <Code>sessionStorage</Code> — not used. Interface
              preferences such as which task group is collapsed or which filter is active live in
              memory for the session, and reset when you close the tab.
            </>,
            <>
              IndexedDB / Cache Storage — not used. There is no offline mode and no local database.
            </>,
            <>
              Service worker — none. {OPERATOR.productName} cannot run in the background on your
              device, and there is no push-notification channel.
            </>,
            <>
              Canvas and WebGL fingerprinting — none. The animated background on the landing page is
              a generated shader; pointer position drives parallax locally and is never transmitted
              or stored.
            </>,
            <>
              Cookies on the landing page for visitors who are not signed in — none. Browsing the
              marketing pages sets nothing at all; the cookie appears only when you log in or sign
              up.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party cookies, scripts and requests",
    body: (
      <>
        <P>
          No third party sets a cookie through our pages, and loading our pages does not make your
          browser ask anyone else for anything. There is no analytics script, no advertising pixel,
          no social embed, no video embed, no map, no chat widget, no A/B-testing tool and no error
          reporting service. Even the webfonts are served from our own origin rather than a font
          CDN, so a page view does not leak your visit to Google.
        </P>
        <P>
          Requests the browser does make go to our own API under the same origin, and the response
          headers allow-credentials only for origins the operator has configured. The images of the
          product on our landing page are screenshots stored as files on our server, not embedded
          previews of your own data.
        </P>
        <Callout title="A self-hosted instance is stricter still">
          <P>
            Because nothing in the software calls out to us, an installation behind your firewall
            issues no third-party requests at all. Your browser will not contact our servers unless
            you point it there.
          </P>
        </Callout>
      </>
    ),
  },
  {
    id: "control",
    title: "Controlling, blocking and deleting the cookie",
    body: (
      <>
        <P>
          You can block or delete cookies in your browser at any time; it is your browser and your
          machine. Blocking a strictly necessary cookie does not make you safer, it just makes the
          product unusable — but the choice is yours and here is what each route costs:
        </P>
        <LegalTable
          head={["Browser", "Where the setting is", "Effect of blocking mokara_token"]}
          rows={[
            [
              "Chrome / Edge",
              "Settings → Privacy and security → Cookies and other site data",
              "You cannot sign in, or you are signed out on the next request.",
            ],
            [
              "Safari",
              "Settings → Privacy → Manage Website Data",
              "Same — the session cannot be established.",
            ],
            [
              "Firefox",
              "Settings → Privacy & Security → Cookies and Site Data",
              "Same. Blocking all cookies also breaks other sites, which is why per-site exceptions are the better tool.",
            ],
            [
              "Any browser, one-off",
              "The padlock or site-information icon in the address bar → cookies for this site → remove",
              "Signed out immediately, as if you had pressed Sign out.",
            ],
          ]}
        />
        <Sub n="7.1">Private and incognito browsing</Sub>
        <P>
          Works normally. The cookie exists only for that window and is destroyed when you close it,
          which is the cheapest way to use a shared or borrowed computer. On any device that is not
          yours, always sign out rather than relying on the window closing.
        </P>
        <Sub n="7.2">What still happens if you block it</Sub>
        <P>
          The landing, sign-up and login pages remain readable. Anything behind sign-in returns to
          the login screen, because an unauthenticated request is not allowed to see data — which is
          the point.
        </P>
      </>
    ),
  },
  {
    id: "session-length",
    title: "How long you stay signed in",
    body: (
      <P>
        Seven days, from the moment the token is issued — not seven days from your last visit, so an
        idle session does end and you will be asked to sign in again. Logging out ends it at once:
        your browser deletes the cookie and the server simultaneously invalidates the token itself,
        so even a previously captured copy stops working the moment you sign out. We chose a week
        rather than a single-tab-session cookie because a task board is something you return to
        during the day over several days; if you would prefer shorter, that is a browser-level
        control (clear on exit, or private mode) rather than a setting we need to build.
      </P>
    ),
  },
  {
    id: "tracking-signals",
    title: "Do Not Track and Global Privacy Control",
    body: (
      <P>
        We do not track you across sites or sessions, so there is no tracking for a signal to switch
        off, and our software does not read <Code>Do Not Track</Code> or Global Privacy Control
        header values. That is not us overriding your preference — a GPC signal is a request not to
        be sold or shared for cross-context behavioural advertising, and we do not do that with
        anyone’s data, signalled or not. If we ever add measurement that <Strong>is</Strong>{" "}
        affected by such a signal, we will honour it and rewrite this section to say how.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <P>
        This page changes when the storage our product uses changes. The date at the top is the last
        change. Material additions — anything that is not strictly necessary, or that a third party
        sets — arrive with a consent mechanism in place before the cookie does, not after.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Questions and contact",
    body: (
      <>
        <P>
          If you find {OPERATOR.productName} storing something on your device that this page does
          not list, that is a bug or a lie, and we want to know about either one immediately —{" "}
          <Mailto />.
        </P>
        <ContactBlock />
        <P>
          What the cookie means for your personal data is covered in the{" "}
          <Internal href={LEGAL_DOCS.privacy.href}>Privacy Policy</Internal>; the rules for using an
          account are in the <Internal href={LEGAL_DOCS.terms.href}>Terms of Use</Internal>.
        </P>
      </>
    ),
  },
];

export default function CookiePolicyPage() {
  return <LegalDoc meta={LEGAL_DOCS.cookies} sections={SECTIONS} also={["privacy", "terms"]} />;
}
