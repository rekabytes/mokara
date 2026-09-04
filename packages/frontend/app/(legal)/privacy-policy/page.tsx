import type { Metadata } from "next";
import {
  Callout,
  Code,
  ContactBlock,
  field,
  Internal,
  L,
  LegalDoc,
  LegalTable,
  Mailto,
  P,
  Pending,
  Strong,
  Sub,
  type LegalSection,
} from "@/components/LegalDoc";
import { CONTACT, LEGAL_DOCS, OPERATOR, siteHost } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: LEGAL_DOCS.privacy.description,
};

// Written against the code, not a template: every claim below maps to something
// that actually exists in packages/backend/src (schema, cookies.ts,
// request-log.ts) or to something deliberately absent (no email field, no
// third-party scripts, no client-side storage).

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this covers",
    body: (
      <>
        <P>
          This policy explains how{" "}
          <Strong>{field(OPERATOR.name, "LEG_OPERATOR_NAME", "the operator")}</Strong> (“we”, “us”)
          handles personal data when you use <Strong>{OPERATOR.productName}</Strong> (the “Service”)
          at <Strong>{field(siteHost(), "NEXT_PUBLIC_SITE_URL", "service URL")}</Strong>, and what
          happens to your data if you or your team run {OPERATOR.productName} on your own
          infrastructure.
        </P>
        <P>
          The Service is provided by{" "}
          <Strong>{field(OPERATOR.name, "LEG_OPERATOR_NAME", "the operator")}</Strong>
          {OPERATOR.registrationNo ? (
            <>
              , registered as <Strong>{OPERATOR.registrationNo}</Strong>
            </>
          ) : null}
          {OPERATOR.entityNote ? <>, which is {OPERATOR.entityNote}</> : null}. Personal-data
          requests are handled by the operator directly rather than by a nominated data protection
          officer, and the correspondence address is not printed on this page —{" "}
          <Internal href="#contact">Contact and complaints</Internal> states what we will provide
          instead.
        </P>
        <P>
          It is written to satisfy the notice requirement in the Malaysian{" "}
          <Strong>Personal Data Protection Act 2010 (Act 709)</Strong>, as amended by the Personal
          Data Protection (Amendment) Act 2024 and brought into force in phases from 1 April 2025
          (the “PDPA”), and to be usable alongside the EU GDPR, the UK GDPR, and the other
          frameworks listed in <Internal href="#regions">Statements for specific regions</Internal>.
        </P>
        <Sub n="1.1">Two ways to run {OPERATOR.productName}</Sub>
        <L
          items={[
            <>
              <Strong>Hosted by us.</Strong> We operate the Service for you. We are the data
              controller for the personal data described here, and you are a data subject (and, if
              you create a workspace for other people, a joint controller in substance — see{" "}
              <Internal href="#visibility">Who can see your data</Internal>).
            </>,
            <>
              <Strong>Self-hosted by you.</Strong> {OPERATOR.productName} ships as Docker images and
              is designed to be run on your own server. In that case we have no access to your
              database, no visibility into your traffic, and no role at all: you become the sole
              data controller, and this document doubles as the reference you can hand to your own
              users, your IT department, or your regulator to explain what the software records.
              Nothing in a self-hosted installation phones home.
            </>,
          ]}
        />
        <P>
          This policy does not cover third-party services you reach through links we publish, or the
          practices of a team that runs its own instance under a different policy.
        </P>
      </>
    ),
  },
  {
    id: "short-version",
    title: "The short version",
    body: (
      <>
        <L
          items={[
            <>
              <Strong>We do not ask for your email address.</Strong> {OPERATOR.productName} accounts
              are a username, an optional display name and a password. There is no email field, no
              phone number, no payment instrument and no identity document anywhere in the schema.
            </>,
            <>
              <Strong>One cookie.</Strong> A single first-party, <Code>httpOnly</Code> session
              cookie keeps you signed in. It is strictly necessary, which is why there is no consent
              banner — see the <Internal href={LEGAL_DOCS.cookies.href}>Cookie Policy</Internal>.
            </>,
            <>
              <Strong>No trackers at all.</Strong> No analytics scripts, no advertising pixels, no
              social plugins, no third-party CDN, no fingerprinting. Even the webfonts are
              self-hosted, so loading a page does not contact anyone else’s server.
            </>,
            <>
              <Strong>No client-side storage.</Strong> We do not use <Code>localStorage</Code>,{" "}
              <Code>sessionStorage</Code> or IndexedDB. Closing the tab clears nothing you need to
              worry about, because nothing was written.
            </>,
            <>
              <Strong>We never sell or share personal data</Strong> for advertising, and we do not
              rent it, index it, or feed it to a third-party model.
            </>,
            <>
              <Strong>Your teammates can see your work.</Strong> That is the product. Status
              changes, deadline edits and comments are attributed to you by design — read{" "}
              <Internal href="#visibility">Who can see your data</Internal> before you invite
              anyone.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: (
      <>
        <P>
          Everything we hold falls into four buckets. We do not collect anything beyond them, and
          the “where it lives” column is the actual database table behind each item.
        </P>
        <Sub n="3.1">Account information you give us</Sub>
        <LegalTable
          head={["Data", "Details", "Where it lives"]}
          rows={[
            [
              "Username",
              "3–20 characters, lowercase letters, digits and underscore. Unique case-insensitively. It is your identity inside the app and how teammates invite you.",
              <Code key="users.username">users.username</Code>,
            ],
            [
              "Display name",
              "Optional, up to 50 characters. Shown next to your comments and task activity.",
              <Code key="users.display_name">users.display_name</Code>,
            ],
            [
              "Password",
              "Stored only as a bcrypt hash (cost 10). We cannot read it, and “forgotten password” does not exist because we never see it — see the caveat in section 12.",
              <Code key="users.password_hash">users.password_hash</Code>,
            ],
            [
              "Timestamps",
              "When the account was created and last changed.",
              "users created_at / updated_at",
            ],
          ]}
        />
        <Sub n="3.2">Work you and your team create</Sub>
        <P>
          The content you type is your business data — and where it names or describes a person, it
          is that person’s personal data too. This is the part you control, and the part we will not
          look at unless you ask us to help.
        </P>
        <L
          items={[
            <>
              Workspaces and teams: a name (up to 50 characters), a URL slug, whether it is a
              personal workspace or a team, its owner, and its membership list with roles.
            </>,
            <>
              Projects and KPIs: names, a colour, an archived flag, and KPI ownership and weight.
            </>,
            <>
              Tasks: title, free-text description, status, priority, due date, an “needs attention”
              flag, and which project and KPIs the task is bound to.
            </>,
            <>
              Comments: the text you post (up to 2,000 characters) and the thread structure of
              replies.
            </>,
          ]}
        />
        <Callout title="Free text is free text">
          <P>
            You can write anything in a task title, description or comment — including information
            about other people, and sensitive personal data such as health, religious or biometric
            information as the PDPA defines it. We do not look for it, we do not categorise it, and
            we cannot promise to protect it better than the access controls in section 12. Please do
            not use {OPERATOR.productName} as a filing cabinet for other people’s medical records,
            payroll data, or identity documents.
          </P>
        </Callout>
        <Sub n="3.3">History we record automatically</Sub>
        <P>
          {OPERATOR.productName} writes an event row when your work changes state, because the
          analytics and progress views are built from real transitions rather than guesses:
        </P>
        <L
          items={[
            <>
              One row per task status change, recording the task, the actor and the moment (
              <Code>task_events</Code>). The date a task first moved to “in progress” is how we know
              when work started.
            </>,
            <>
              One row per deadline change, recording the previous date, the new date and the actor (
              <Code>task_due_changes</Code>). This is what draws the “deadline moved” marks on the
              heatmap.
            </>,
            <>
              Invitation records: who invited which username to which team, whether it is pending,
              accepted or declined, and when it expired (seven days after creation by default).
            </>,
          ]}
        />
        <P>
          These are personal data in the PDPA sense to the extent they describe an identifiable
          person’s work pattern. They are visible to the teammates in that container and nowhere
          else. We do not use them for anything except the views you can see yourself.
        </P>
        <Sub n="3.4">Technical information</Sub>
        <P>
          See <Internal href="#logs">Server logs</Internal>. In short: request metadata (method,
          path, status code, duration, the authenticated username, and the error code for failures).
          No IP address, no user-agent string, no device identifier and no geolocation is captured
          by {OPERATOR.productName} itself.
        </P>
        <Sub n="3.5">Information from other sources</Sub>
        <P>
          None. There is no social login, no email-verification provider, no address or company
          enrichment service, and no advertising network. We do not receive data about you from
          anyone else, and we do not combine data across installations.
        </P>
      </>
    ),
  },
  {
    id: "what-we-do-not-collect",
    title: "Information we deliberately do not collect",
    body: (
      <>
        <P>
          It is easier to trust a policy that names what is missing, so: email address, phone
          number, postal address, date of birth, government or tax identifiers, payment card data,
          precise geolocation, contacts, calendar, files, camera or microphone, browsing history
          outside this Service, advertising identifiers, device fingerprints, and behavioural
          profiles of you as a person.
        </P>
        <P>
          The ambient background animation on our landing page runs entirely in your browser’s
          graphics processor; pointer position is used locally for parallax and is never transmitted
          or stored.
        </P>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use information, and our lawful basis",
    body: (
      <>
        <P>
          Under the PDPA, personal data may only be processed for a purpose the data subject was
          notified of, and normally with consent. Under the GDPR we must also name a lawful basis.
          The table does both.
        </P>
        <LegalTable
          head={["Purpose", "Data used", "GDPR / UK GDPR basis", "PDPA basis"]}
          rows={[
            [
              "Create and operate your account; authenticate you on each visit",
              "Username, password hash, session cookie",
              "Performance of a contract (Art. 6(1)(b))",
              "Consent, s. 6(1)",
            ],
            [
              "Let your team see and coordinate work: boards, threads, progress",
              "Work content and history",
              "Performance of a contract; legitimate interest in the collaboration feature working",
              "Consent (necessary for the intended purpose)",
            ],
            [
              "Compute analytics, weighted KPI progress and the deadline heatmap",
              "Task statuses, timestamps, event and due-change rows",
              "Legitimate interest (Art. 6(1)(f)) — internal, non-intrusive, visible to you",
              "Consent, as described in this notice",
            ],
            [
              "Keep the Service secure; diagnose faults; investigate abuse",
              "Request logs, error codes",
              "Legitimate interest (security and reliability)",
              "Legitimate interests recognised by s. 6(2) exceptions",
            ],
            [
              "Comply with law, respond to valid requests, keep records",
              "Account and billing data where applicable",
              "Legal obligation (Art. 6(1)(c))",
              "Required or authorised by law",
            ],
            [
              "Improve the product",
              "Aggregate counts only; no per-user profiling",
              "Legitimate interest",
              "Consent, as described in this notice",
            ],
          ]}
        />
        <P>
          We do not send marketing email, so there is no marketing basis to state — not because we
          respect your inbox, but because we never asked for it. If that ever changes, this section
          will change first and consent will be opt-in.
        </P>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and device storage",
    body: (
      <>
        <P>
          {OPERATOR.productName} sets exactly one cookie, <Code>mokara_token</Code> (prefixed{" "}
          <Code>__Host-</Code> in production), which holds a signed session token so the Service
          knows you are already logged in. It is <Code>httpOnly</Code> (invisible to JavaScript on
          the page), <Code>SameSite=Lax</Code>, scoped to this site, marked <Code>Secure</Code> in
          production, and expires after seven days. Logging out deletes it immediately.
        </P>
        <P>
          Because that cookie is strictly necessary to provide the feature you asked for, it is
          exempt from the consent requirement in the EU ePrivacy Directive (Article 5(3)) and the UK
          PECR, and no Malaysian law imposes a separate cookie consent — the PDPA treats any
          personal data in a cookie like any other personal data. Full details, including how to
          block it, are in the <Internal href={LEGAL_DOCS.cookies.href}>Cookie Policy</Internal>.
        </P>
      </>
    ),
  },
  {
    id: "logs",
    title: "Server logs",
    body: (
      <>
        <P>Every API request produces one log line so that a failure can be explained:</P>
        <Callout>
          <P>
            <Code>
              PATCH /api/tasks/9f2 → 403 (2ms) · alice · forbidden “not a member of this team”
            </Code>
          </P>
        </Callout>
        <P>
          That line contains the method, the path, the response status, how long the request took,
          the username of the caller if they were signed in, and the error code plus message if the
          request failed. Logs are written to the application’s standard output and live with the
          container or platform running it; they are rotated with it and are not loaded into the
          database, not searchable by other users, and not exposed in any product view. The
          application does not record IP addresses or user-agent strings. If the Service is placed
          behind a reverse proxy, load balancer or hosting platform, that layer may log IP addresses
          and user-agent strings for its own security and abuse-prevention purposes, under the
          operator’s configuration.
        </P>
      </>
    ),
  },
  {
    id: "visibility",
    title: "Who can see your data",
    body: (
      <>
        <P>
          This is the most important section in this policy, because {OPERATOR.productName} is a
          collaboration tool and visibility is not an accident — it is the product.
        </P>
        <LegalTable
          head={["Container", "Who can see the contents", "Who can change them"]}
          rows={[
            ["Personal workspace (default at sign-up)", "Only you", "Only you"],
            [
              "Team",
              "Every member of that team, including tasks, comments, projects, KPIs and history",
              "Members can create and bind; the creator of an item, or the team leader, can edit or delete it",
            ],
          ]}
        />
        <Callout tone="warn" title="“Personal” does not mean hidden">
          <P>
            Projects and KPIs can be owned by an individual inside a team. They are labelled
            personal, and only their owner can edit them — but they are still{" "}
            <Strong>visible to your teammates</Strong>, because the board would be misleading
            otherwise. The only genuinely private space in {OPERATOR.productName} is a workspace
            with no other members. If you need an item that teammates cannot see at all, do not put
            it in a team container.
          </P>
        </Callout>
        <P>
          Your personal workspace becomes a team automatically the moment somebody accepts an
          invitation to it. That conversion is deliberate and cannot be reversed in the current
          version, so treat an accepted invitation as the point where your board became shared.
        </P>
        <P>
          Team membership is capped at three people per team, which bounds the audience for anything
          you post in one.
        </P>
      </>
    ),
  },
  {
    id: "disclosure",
    title: "Who we share information with",
    body: (
      <>
        <P>We disclose personal data only in the following circumstances:</P>
        <L
          ordered
          items={[
            <>
              <Strong>People you choose.</Strong> Members of a container you belong to, as described
              in section 8. This is disclosure by design, and it is you who invites them.
            </>,
            <>
              <Strong>Our service providers.</Strong> The hosting provider that runs the server and
              database for the hosted Service, and the providers we use to build and publish the
              software. They process data on our instructions under confidentiality obligations, and
              the list is in{" "}
              <Internal href="#subprocessors">Third-party services and sub-processors</Internal>.
            </>,
            <>
              <Strong>Legal and governmental requests.</Strong> Where we are required or permitted
              by law — including the exemptions in the PDPA for the prevention and detection of
              crime, legal proceedings, and the essential interests of Malaysia — or by a valid
              court or regulatory order in another country. We narrow overbroad requests where we
              can, and we tell you about a request unless we are legally prohibited from doing so,
              so that you can challenge it yourself.
            </>,
            <>
              <Strong>A successor.</Strong> If all or part of our business is sold, merged or
              restructured, customer data may transfer with it, subject to the promises in this
              policy, and we will notify you.
            </>,
          ]}
        />
        <P>
          We do not sell, rent, trade or broadcast personal data, and we do not share it with
          advertising, analytics or data-broking companies. In CCPA/CPRA terms: we do not “sell” or
          “share” personal data, and we have no reason to respond to a Global Privacy Control signal
          because nothing is tracked across sites.
        </P>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data is stored and cross-border transfers",
    body: (
      <>
        <P>
          The hosted Service runs in{" "}
          <Strong>
            {CONTACT.hostingRegion ?? (
              <Pending varName="LEG_HOSTING_REGION">hosting region</Pending>
            )}
          </Strong>
          , and the database does not replicate to other regions on its own.
        </P>
        <Sub n="10.1">Malaysia</Sub>
        <P>
          Section 12 of the PDPA restricts transferring personal data outside Malaysia. Since the
          2024 amendments, a transfer is permitted where the destination jurisdiction has a law
          substantially similar to the PDPA, or otherwise ensures an adequate level of protection.
          We keep the hosted Service inside a single approved region; if a transfer ever becomes
          necessary we will either rely on one of those grounds or tell you where your data would go
          before it happens.
        </P>
        <Sub n="10.2">Europe, the UK and Switzerland</Sub>
        <P>
          Where GDPR or UK GDPR applies and personal data leaves the EEA or UK, we do so only under
          a valid transfer mechanism: an adequacy decision, or the EU Standard Contractual Clauses
          (Commission Implementing Decision 2021/914) with the UK Addendum and the Swiss Addendum as
          applicable, supported by a transfer risk assessment. No data leaves the region by default,
          so in normal use of the Service this is a safeguard, not a routine event.
        </P>
        <Sub n="10.3">Self-hosted installations</Sub>
        <P>
          Your installation stores data wherever you put it, and the transfer analysis is yours to
          make. Because the software performs no outbound calls, hosting it in Malaysia (or any
          country you choose) genuinely contains the data.
        </P>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <>
        <P>
          The PDPA’s retention principle says personal data must not be kept longer than necessary
          for the purpose it was collected for. Here is how we apply that:
        </P>
        <LegalTable
          head={["Data", "Kept for", "How it ends"]}
          rows={[
            [
              "Account (username, display name, password hash)",
              "As long as the account exists",
              "Deleted on request; see section 11.1",
            ],
            [
              "Tasks, comments, projects, KPIs",
              "As long as you or your team keep the container",
              "Deleting a task deletes its comments and history (foreign keys cascade); leaving a team removes your membership",
            ],
            [
              "Event and due-change history",
              "Same as the task it describes",
              "Cascades with the task",
            ],
            [
              "Invitations",
              "Seven days to respond, then the record is kept in its final state",
              "Accepted or declined invitations stay so the audit trail is honest; a pending invitation cannot be acted on after it expires",
            ],
            ["Session cookie", "Seven days from issue, or until logout", "Expires or is deleted"],
            [
              "Server logs",
              "Only as long as the running platform keeps stdout",
              <>
                Rotated with the platform’s own log retention —{" "}
                {CONTACT.backupRetention ?? (
                  <Pending varName="LEG_BACKUP_RETENTION">log retention period</Pending>
                )}
              </>,
            ],
          ]}
        />
        <Sub n="11.1">Deleting your account</Sub>
        <P>
          There is currently no self-service “delete my account” button in the product. Deletion is
          carried out on request: ask us using the contact in{" "}
          <Internal key="r-complain" href="#contact">
            Contact and complaints
          </Internal>
          , from a session where you are signed in (or have your workspace owner confirm it), and we
          will remove your account. Because your content belongs to the containers it sits in,
          deleting your account removes your membership and your ownership; tasks and comments in a
          team are retained for the team unless you delete them first, with authorship shown as
          removed rather than rewritten.
        </P>
        <P>
          Backups: deletion is immediate in the live database, and becomes permanent in backups
          after{" "}
          <Strong>
            {CONTACT.backupRetention ?? (
              <Pending varName="LEG_BACKUP_RETENTION">backup retention period</Pending>
            )}
          </Strong>
          . We do not restore a backup to bring deleted personal data back.
        </P>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect information",
    body: (
      <>
        <P>Measures actually implemented in the software:</P>
        <L
          items={[
            <>
              <Strong>Passwords are never stored or recoverable.</Strong> bcrypt with a cost factor
              of 10. There is no “email me my password” path in the product because there is no
              password to email — which also means there is no self-service password reset, and that
              is a real trade-off we are being straight with you about (see section 11.1 for how to
              get an account reset).
            </>,
            <>
              <Strong>Sessions are hard to steal.</Strong> The token cookie is <Code>httpOnly</Code>
              , <Code>SameSite=Lax</Code> and <Code>Secure</Code> in production; the token itself is
              an HS256 JWT signed with a server-side secret, so its contents cannot be forged by a
              client.
            </>,
            <>
              <Strong>Every request is authorised server-side.</Strong> Membership is checked on
              each team-scoped endpoint before data is read, and write permissions are enforced for
              edit and delete. Access checks run before existence checks so the API never leaks
              which identifiers exist.
            </>,
            <>
              <Strong>Input is validated at the edge.</Strong> Every request body is parsed against
              a strict schema with explicit field lists and length caps; unknown fields are
              rejected. Database access goes through an ORM with parameterised queries.
            </>,
            <>
              <Strong>Least privilege.</Strong> The application connects with a database role that
              can only touch the tables it needs; secrets are environment variables and are never
              committed to the repository.
            </>,
            <>
              <Strong>TLS.</Strong> In production the Service is served over HTTPS, so credentials
              and content are encrypted in transit. Only the certificate and hosting configuration
              are ours to promise — if you self-host, that requirement moves to you.
            </>,
          ]}
        />
        <Callout tone="warn" title="No system is perfect">
          <P>
            No method of transmission or storage is absolutely secure, and we do not claim
            otherwise. You are responsible for keeping your password and your signed-in devices
            safe; anyone with access to either can act as you, and the history in section 3.3 will
            attribute their actions to your account. If you think your account has been used without
            your permission, write to <Mailto /> immediately.
          </P>
        </Callout>
      </>
    ),
  },
  {
    id: "breach",
    title: "If something goes wrong",
    body: (
      <>
        <P>
          If personal data is lost, stolen, disclosed or accessed without authorisation, we will
          investigate, contain the incident, and assess whether it is likely to be detrimental to
          any individual.
        </P>
        <L
          items={[
            <>
              <Strong>Malaysia.</Strong> Where a breach is likely to cause harm, we notify the
              Personal Data Protection Commissioner in line with the breach-notification
              requirements introduced by the 2024 amendments and the 2025 regulations — without
              undue delay and, as those requirements currently specify, within 72 hours of becoming
              aware — and we notify affected data subjects as soon as practicable.
            </>,
            <>
              <Strong>EU and UK.</Strong> Where GDPR or UK GDPR applies, we notify the competent
              supervisory authority within 72 hours (Article 33) and affected individuals without
              undue delay where the breach is likely to result in a high risk to their rights
              (Article 34).
            </>,
            <>
              <Strong>Everywhere else.</Strong> We follow the notification rules of the affected
              jurisdiction, and we will tell you what happened either way.
            </>,
          ]}
        />
        <P>
          For a self-hosted installation you are the controller and you hold the obligation; we will
          cooperate on any vulnerability disclosure and publish fixes in a release.
        </P>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <>
        <P>
          Write to <Mailto /> — the route is spelled out in{" "}
          <Internal href="#contact">Contact and complaints</Internal>. Because accounts have no
          email address, we identify requests by the account itself — send it while signed in, or
          have your workspace owner confirm it — and we will not fulfil a request that we cannot tie
          to a real account. We respond within 21 days for a PDPA access request and within one
          month where GDPR or UK GDPR applies; complex requests may take longer, and we will tell
          you. There is no fee for a reasonable request.
        </P>
        <LegalTable
          head={["Right", "What it means here", "How"]}
          rows={[
            [
              "Know and access",
              "A copy of the personal data we hold about you, and confirmation of whether we process it",
              "Ask; we supply it in JSON or CSV",
            ],
            [
              "Correct or amend",
              "Fix your display name, or any inaccurate content you cannot edit yourself",
              "In product where possible; otherwise ask us",
            ],
            [
              "Delete / erase",
              "Remove your account and your content",
              <Internal key="r-del" href="#retention">
                Section 11.1
              </Internal>,
            ],
            [
              "Object or restrict",
              "Object to processing based on legitimate interests (the analytics and history in section 3.3), or ask us to pause processing",
              "Ask; we will explain what can and cannot stop",
            ],
            [
              "Withdraw consent",
              "Stop the processing that consent justifies — in practice, stop using the Service",
              "Delete your account",
            ],
            [
              "Portability",
              "Your data in a structured, machine-readable format, where technically feasible",
              "Ask",
            ],
            [
              "Complain",
              "Escalate to the regulator, in Malaysia or in your country",
              <Internal key="r-complain" href="#contact">
                Contact and complaints
              </Internal>,
            ],
          ]}
        />
        <P>
          Practical note on correction and deletion inside a team: your teammates’ view of a shared
          task is their data too. We will not rewrite history to make a collaborative record
          misleading — we remove your personal identifiers and let the container owner delete the
          item.
        </P>
      </>
    ),
  },
  {
    id: "regions",
    title: "Statements for specific regions",
    body: (
      <>
        <P>
          {OPERATOR.productName} is made in Malaysia and the PDPA is the framework it is written
          against. We do not set out to sell to anyone abroad, but the software is self-hostable and
          the Service is reachable from anywhere, so the following records where additional rights
          apply to you. Where one of these frameworks binds us, it adds to this policy; it never
          subtracts from it.
        </P>
        <Sub n="15.1">Malaysia — Personal Data Protection Act 2010 (Act 709)</Sub>
        <P>
          This is our baseline. The PDPA’s Protection Principles (Part II — general, notice and
          choice, disclosure, access, retention, security, integrity and restrictions on transfer)
          govern our processing; the amendments in force from 2025 renamed the “data user” to the
          data controller, added biometric data to sensitive personal data, strengthened penalties,
          and introduced the breach-notification duties described in section 13. Your Part III
          rights (access, amendment, withdrawal of consent, and complaint to the Commissioner) are
          in <Internal href="#rights">section 14</Internal>. We do not process sensitive personal
          data as defined by the PDPA — health, biometric, religious or political data, or data on
          criminal convictions — for any feature of the Service; if you type it into a task, that is
          your decision and it is not something we knowingly process.
        </P>
        <Sub n="15.2">EU, EEA and United Kingdom — GDPR and UK GDPR</Sub>
        <L
          items={[
            "Controller: the operator named in section 1. Where the Service is offered to you in the EEA or UK, this policy states our identity, purposes, lawful bases, retention, rights and complaint route as required by Articles 13 and 14.",
            "Rights of access, rectification, erasure, restriction, objection and portability under Articles 15 to 20; objection to processing on legitimate-interest grounds under Article 21; the right to lodge a complaint with your supervisory authority under Article 77.",
            "No automated decision-making producing legal or similarly significant effects (Article 22) — see section 17.",
            "If you are in the EEA or UK and want to reach a local representative, use the contact in section 20.",
          ]}
        />
        <Sub n="15.3">United States — state privacy laws</Sub>
        <P>
          To the extent the California Consumer Privacy Act as amended by the CPRA, or a comparable
          state law (Virginia, Colorado, Connecticut, Utah, Texas, Oregon and others), applies: we
          collect the categories of personal information listed in section 3, we disclose them for a
          business purpose only as described in section 9, we do <Strong>not</Strong> sell or share
          personal information, we do not process sensitive personal information for feature
          purposes, and we do not retain information beyond section 11. You have the right to know,
          correct, delete, and opt out of sale or sharing (nothing to opt out of), and the right not
          to be discriminated against for exercising any of them. Our browser-based systems do not
          recognise Global Privacy Control signals because they perform no cross-site tracking to
          begin with.
        </P>
        <Sub n="15.4">Asia-Pacific and other jurisdictions</Sub>
        <LegalTable
          head={["Jurisdiction", "Law", "What we rely on it for"]}
          rows={[
            [
              "Singapore",
              "Personal Data Protection Act 2012",
              "Consent, purpose limitation, notification and protection obligations. Note this is a different statute from Malaysia’s PDPA despite the shared name.",
            ],
            [
              "Indonesia",
              "Law No. 27 of 2022 on Personal Data Protection",
              "Lawful basis, data-subject rights, and breach notification where the Service is used there.",
            ],
            [
              "Thailand",
              "Personal Data Protection Act B.E. 2562 (2019)",
              "Lawful basis, consent and cross-border transfer conditions.",
            ],
            [
              "Vietnam",
              "Decree 13/2023/NĐ-CP on personal data protection",
              "Consent content and the obligation to inform data subjects.",
            ],
            [
              "Japan",
              "Act on the Protection of Personal Information (APPI)",
              "Purpose notification and third-party transfer restrictions.",
            ],
            [
              "South Korea",
              "Personal Information Protection Act (PIPA)",
              "Notice, consent and processing-limitation duties.",
            ],
            [
              "India",
              "Digital Personal Data Protection Act 2023",
              "Notice, consent and data-principal rights where applicable.",
            ],
            [
              "Australia",
              "Privacy Act 1988 and the Australian Privacy Principles",
              "Open and transparent management of personal information (APP 1), access and correction (APP 12 and 13).",
            ],
            [
              "New Zealand",
              "Privacy Act 2020 (Information Privacy Principles)",
              "Purpose, disclosure, storage-security and access principles.",
            ],
            [
              "Brazil",
              "Lei Geral de Proteção de Dados (LGPD, Law 13.709/2018)",
              "Legal bases, rights and the incident-notice duty.",
            ],
            [
              "South Africa",
              "Protection of Personal Information Act 4 of 2013 (POPIA)",
              "Processing conditions and data-subject rights.",
            ],
            [
              "Canada",
              "PIPEDA, plus provincial statutes such as Quebec’s Law 25",
              "Accountability, consent, and access and correction rights.",
            ],
            [
              "Switzerland",
              "Federal Act on Data Protection (revFADP)",
              "Disclosure of processing and the rights of data subjects.",
            ],
            [
              "Türkiye",
              "Law No. 6698 on the Protection of Personal Data (KVKK)",
              "The Article 10 information duty and data-subject rights.",
            ],
          ]}
        />
        <P>
          If the law of your country gives you a right this policy does not name, tell us and we
          will honour it, and then fix this page.
        </P>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        The Service is a work-management tool for adults and is not directed at children. We do not
        knowingly collect personal data from anyone under 18 (or the age of digital consent in your
        country, if higher). If we learn that a child’s account exists, we will delete it — please
        report it to us. A team that adds a minor as a member is responsible for that decision, and
        the visibility rules in section 8 apply with full force.
      </P>
    ),
  },
  {
    id: "automated",
    title: "Automated decision-making and profiling",
    body: (
      <>
        <P>
          We do not build behavioural profiles of you, and we do not make decisions about you by
          automated means with legal or similarly significant effect. The KPI weights, progress
          percentages and heatmap in the product are arithmetic over work that members themselves
          recorded, shown only to the members of that container. They are not a performance-scoring
          system, they do not leave the team, and no employment decision is automated from them.
        </P>
        <P>
          A caution for teams, though, which we would rather state here than leave unsaid: an
          employer that runs a shared board can see when a member started, moved or completed work.
          If you use {OPERATOR.productName} for people management, tell your team that the board is
          visible, and keep the conversation honest. There is no covert monitoring mode, and there
          never will be.
        </P>
      </>
    ),
  },
  {
    id: "subprocessors",
    title: "Third-party services and sub-processors",
    body: (
      <>
        <P>
          These are the only services the hosted instance touches, and the only ones that could ever
          see your data through us. There is no analytics provider and no error-reporting service,
          which is why they are absent from this list.
        </P>
        <LegalTable
          head={["Service", "Role", "Data involved"]}
          rows={[
            [
              <>
                {CONTACT.hostingRegion ? (
                  `Hosting provider (${CONTACT.hostingRegion})`
                ) : (
                  <>
                    Hosting provider <Pending varName="LEG_HOSTING_REGION">name + region</Pending>
                  </>
                )}
              </>,
              "Runs the servers, PostgreSQL database and network for the hosted Service",
              "All application data and request logs, under our instruction",
            ],
            [
              "GitHub and its CI runners",
              "Stores the source code and builds the container images",
              "Nothing from the production database; commit metadata and build logs only",
            ],
            [
              "GitHub Container Registry",
              "Publishes the images anyone can pull and deploy",
              "Published image layers only",
            ],
          ]}
        />
        <P>
          Deliberately absent: Google Fonts or any font CDN (typefaces are self-hosted), Google
          Analytics or Plausible or any other measurement script, Sentry or any other error
          collection service, and any social plugin. If we ever add one, this section gains a row
          and you get notice first.
        </P>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <P>
        We may update this policy as the Service and the law change. The date at the top of the page
        is when it last changed; for material changes — a new category of data, a new purpose, a new
        sub-processor, a change to the visibility model — we will give notice in the product and,
        where practicable, at least 14 days before it takes effect. Continuing to use the Service
        after a change takes effect means the new policy applies to you. Older versions are
        available on request.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact, complaints and authorities",
    body: (
      <>
        <ContactBlock />
        <Sub n="20.1">Complaining to us first</Sub>
        <P>
          Tell us what you want — write to <Mailto />. Access, correction, deletion, a copy of your
          data, or an objection to a specific processing activity. We would rather fix it than have
          you escalate it, and we answer every request that we can attribute to an account. Note the
          deliberate asymmetry: you can write to us from wherever you like, but because we hold no
          email address for your account, we cannot reach you outside the product — so a decision or
          notice about your request is something you read by signing in.
        </P>
        <Sub n="20.2">Complaining to a regulator</Sub>
        <L
          items={[
            <>
              <Strong>Malaysia:</Strong> the Personal Data Protection Commissioner (Pesuruhjaya
              Perlindungan Data Peribadi), Jabatan Perlindungan Data Peribadi, under the PDPA. You
              may lodge a complaint directly, and this policy’s notice is given under that Act.
            </>,
            <>
              <Strong>EU/EEA:</Strong> your national data protection supervisory authority, or the
              European Data Protection Board if you prefer a route through us.
            </>,
            <>
              <Strong>UK:</Strong> the Information Commissioner’s Office.
            </>,
            <>
              <Strong>Australia:</Strong> the Office of the Australian Information Commissioner,
              after raising it with us.
            </>,
            <>
              <Strong>Elsewhere:</Strong> your country’s data protection authority — we will tell
              you which one applies if you ask.
            </>,
          ]}
        />
        <P>
          The terms that govern your use of the Service are in the{" "}
          <Internal href={LEGAL_DOCS.terms.href}>Terms of Use</Internal>, and what we store on your
          device is in the <Internal href={LEGAL_DOCS.cookies.href}>Cookie Policy</Internal>.
        </P>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return <LegalDoc meta={LEGAL_DOCS.privacy} sections={SECTIONS} also={["terms", "cookies"]} />;
}
