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
  Strong,
  Sub,
  type LegalSection,
} from "@/components/LegalDoc";
import { LEGAL_DOCS, OPERATOR, siteHost } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: LEGAL_DOCS.terms.description,
};

// Malaysian-framed terms: Contracts Act 1950 for formation, PDPA for the data
// half (which lives in the privacy policy), Computer Crimes Act 1997 and
// s. 233 CMA 1998 for the abuse clauses, and Malaysian courts for disputes —
// with the mandatory-rights carve-outs that make the same text usable abroad.

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement, eligibility and scope",
    body: (
      <>
        <P>
          These Terms of Use (the “Terms”) are a legal agreement between you and{" "}
          <Strong>{field(OPERATOR.name, "LEG_OPERATOR_NAME", "the operator")}</Strong> (“we”, “us”)
          covering your use of <Strong>{OPERATOR.productName}</Strong> at{" "}
          <Strong>{field(siteHost(), "NEXT_PUBLIC_SITE_URL", "service URL")}</Strong> — the task
          board, its API, its marketing site and any feature we add (together, the “Service”). They
          are made under the Malaysian <Strong>Contracts Act 1950</Strong>.
        </P>
        <P>
          The operator is{" "}
          <Strong>{field(OPERATOR.name, "LEG_OPERATOR_NAME", "the operator")}</Strong>
          {OPERATOR.registrationNo ? (
            <>
              , registered as <Strong>{OPERATOR.registrationNo}</Strong>
            </>
          ) : null}
          {OPERATOR.entityNote ? <>, which is {OPERATOR.entityNote}</> : null}. References to “we”
          and “us” mean that party — nothing here is designed to hide who is answerable to you.
        </P>
        <P>By using the Service you accept these Terms. You do that in one of three ways:</P>
        <L
          items={[
            <>creating an account, which is agreement to the whole of this document;</>,
            <>signing in to an account, which continues that agreement;</>,
            <>
              or simply using anything in the Service, which means these Terms apply from that
              moment.
            </>,
          ]}
        />
        <Sub n="1.1">Who may use the Service</Sub>
        <P>
          You must be at least 18 and able to form a binding contract. If you use the Service on
          behalf of an employer, client or other organisation, you confirm you have authority to
          bind that organisation, and “you” in these Terms includes it.
        </P>
        <Sub n="1.2">What these Terms do not cover</Sub>
        <L
          items={[
            <>
              <Strong>Personal data.</Strong> How we handle it is in the{" "}
              <Internal href={LEGAL_DOCS.privacy.href}>Privacy Policy</Internal>, which is part of
              these Terms by reference. Where the two disagree about personal data, the Privacy
              Policy wins.
            </>,
            <>
              <Strong>Self-hosting the software.</Strong> Running our container images or source on
              your own infrastructure is governed by{" "}
              <Internal href="#self-hosting">Self-hosting</Internal> below, plus whatever
              open-source or commercial licence ships with the release you downloaded.
            </>,
            <>
              <Strong>Third-party terms.</Strong> A team that runs its own instance may publish its
              own policy; ours does not bind that instance’s users.
            </>,
          ]}
        />
        <Callout tone="warn" title="Read section 5 and section 14">
          <P>
            Section 5 is what you may not do with the Service. Section 14 is what we are not liable
            for. Both limit you more than the friendly interface suggests they should, and we would
            rather you found that out here.
          </P>
        </Callout>
      </>
    ),
  },
  {
    id: "the-service",
    title: "What the Service is (and is not)",
    body: (
      <>
        <P>
          {OPERATOR.productName} is a shared task board for small teams: tasks with statuses,
          priorities and due dates; projects; personal KPIs with per-task weights; threaded
          comments; analytics; and invitation-based teams capped at three members per team. It runs
          as a web application with a REST API behind it.
        </P>
        <P>It is not, and will not become, any of the following:</P>
        <L
          items={[
            "file storage or a document-management system — there is no upload capability at all",
            "email, chat or a notification service — no email is sent, ever",
            "a records system for sensitive personal data about other people",
            "an infrastructure host for your own applications",
            "a guaranteed-availability service — see section 11",
          ]}
        />
        <P>
          We may add, change or withdraw features. Withdrawing something that is materially
          load-bearing for you is a decision we will announce, not discover for you.
        </P>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <>
        <P>
          An account is a username, an optional display name and a password. Usernames are three to
          twenty characters, limited to lowercase letters, digits and underscores, and unique
          without regard to case — they are how teammates find and invite you, so treat the username
          as public inside your teams.
        </P>
        <Sub n="3.1">One account, one person</Sub>
        <L
          items={[
            <>
              Every human gets their own account. Shared or group logins are not permitted, because
              activity is attributed to an account by design: the event history in the Service shows
              who moved a task and who posted a comment, and a shared credential destroys that.
            </>,
            <>
              You are responsible for everything done under your account while you hold it, and for
              telling us promptly if you believe it has been used without your permission.
            </>,
            <>
              Keep your password and your signed-in devices safe. Passwords are stored only as a
              bcrypt hash and we cannot read them — which means we cannot reset one for you without
              a manual request.
            </>,
          ]}
        />
        <Sub n="3.2">Account requests and verification</Sub>
        <P>
          Because there is no email address on file, we identify you by the account itself. Requests
          about an account should come from a signed-in session on that account, or be confirmed by
          the owner of a workspace the account belongs to. That is a limitation and a protection at
          the same time.
        </P>
      </>
    ),
  },
  {
    id: "teams",
    title: "Workspaces, teams and invitations",
    body: (
      <>
        <P>
          The container for work is a <Strong>workspace</Strong> (private to you) or a{" "}
          <Strong>team</Strong> (shared by its members). This section allocates responsibility,
          because in a collaboration tool the users, not the operator, control who sees what.
        </P>
        <LegalTable
          head={["Role", "Can", "Must"]}
          rows={[
            [
              "Workspace owner / team leader",
              "Invite and remove members, create and archive shared items, control team-scoped projects and KPIs",
              "Have a lawful basis for adding other people’s data, and tell members what is visible",
            ],
            [
              "Member",
              "Create and update work, bind projects and KPIs, comment, see everything in the container",
              "Respect other members’ content and privacy",
            ],
          ]}
        />
        <Sub n="4.1">A personal workspace becomes a team permanently</Sub>
        <P>
          Your workspace converts from private to team the moment someone <Strong>accepts</Strong>{" "}
          an invitation to it. An invitation sent but never accepted changes nothing. The conversion
          cannot be reversed in the current version, so do not invite anyone into a workspace
          containing something you would not want a colleague to read.
        </P>
        <Sub n="4.2">Invitations</Sub>
        <L
          items={[
            "Only a leader may invite, and each team is capped at three members.",
            "An invitation names an existing username; it expires seven days after it is sent.",
            "Do not invite accounts you do not know. An invitation is a statement that you want that person inside the container.",
            "Accepting an invitation puts you in that container’s visibility model: everything in it becomes readable by its members, including your attributed activity there.",
          ]}
        />
        <Callout title="You are the controller of your container">
          <P>
            Data you or your members post in a team is processed on your authority as much as ours.
            If your team handles personal data about customers or employees, you are responsible for
            having a lawful basis under the PDPA (or GDPR, or your local law) and for telling those
            people. Give us a valid legal order and we will act on it; otherwise we do not read your
            boards.
          </P>
        </Callout>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <P>Use the Service lawfully, and in a way that does not damage it for other people.</P>
        <Sub n="5.1">You agree not to</Sub>
        <L
          items={[
            <>
              use the Service for any unlawful purpose, or in a way that infringes someone’s rights
              or breaches a contract or court order you are subject to;
            </>,
            <>
              post content that is obscene, indecent, threatening, hateful, defamatory, or otherwise
              prohibited — in Malaysia, including under the{" "}
              <Strong>Communications and Multimedia Act 1998</Strong> (section 233) and the{" "}
              <Strong>Penal Code</Strong>;
            </>,
            <>
              store or transmit sensitive personal data about other people without a lawful basis
              and their knowledge (health, biometric, religious or political data, or criminal
              convictions, as defined by the PDPA);
            </>,
            <>
              gain unauthorised access to the Service or another account, or attempt to — including
              scanning, probing or testing without our written permission, which is an offence under
              the <Strong>Computer Crimes Act 1997</Strong>;
            </>,
            <>
              introduce malware, or reverse-engineer, decompile or disassemble the hosted Service to
              obtain its source, except where a licence or applicable law expressly permits it;
            </>,
            <>
              overload or impair the Service: no automated scraping, bulk creation, load testing, or
              API use designed to circumvent a limit such as the three-member team cap;
            </>,
            <>
              resell, sublicense or provide a hosted gateway to the Service as a competing product
              without our written agreement;
            </>,
            <>
              impersonate anyone, create accounts for other people without their instruction, or
              evade a suspension or restriction;
            </>,
            <>
              abuse the report, invitation or deletion mechanisms, or submit knowingly false
              requests under the <Internal href={LEGAL_DOCS.privacy.href}>Privacy Policy</Internal>.
            </>,
          ]}
        />
        <Sub n="5.2">Rate limits and technical measures</Sub>
        <P>
          We apply technical limits so the Service stays usable — input validation with strict field
          lists and length caps, per-container membership checks on every request, and the container
          size cap. Limits may change without individual notice. We may throttle or stop traffic
          that looks like abuse; if we do it to you by mistake, tell us and we will fix it.
        </P>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <>
        <P>
          Tasks, descriptions, comments, project names, KPI names and everything else you type is
          your content. <Strong>You keep all of it.</Strong> Nothing in these Terms transfers
          ownership to us, and we claim no rights in your work beyond the narrow licence below.
        </P>
        <Sub n="6.1">The licence you give us</Sub>
        <P>
          You grant us a non-exclusive, worldwide, royalty-free licence, limited to the period you
          use the Service, to host, store, transmit, display to your authorised teammates, back up
          and — only where technically necessary — format or cache your content, for the sole
          purpose of operating the Service for you. We may also aggregate non-identifying statistics
          about usage to understand capacity and feature adoption. We will not publish your content,
          use it to train a model for another customer, or sell it.
        </P>
        <Sub n="6.2">What you warrant</Sub>
        <L
          items={[
            "you own or have the rights to the content you post;",
            "posting it does not breach these Terms, another person’s confidentiality, or any law;",
            "where your content includes personal data about other people, you have a lawful basis for processing it and have told them about it.",
          ]}
        />
        <Sub n="6.3">Moderation and removal</Sub>
        <P>
          We do not monitor content as a matter of course — which is the same promise from the other
          side of the fence as section 4. We may suspend access to, or remove, content we reasonably
          believe is unlawful, that puts the Service or other users at risk, or that we are required
          to remove by a court or regulator. Where we are allowed to, we tell you what and why, and
          you can ask us to review it. For content inside a team, the ordinary first move is to ask
          the leader or the author — we are not the referee of your team’s board.
        </P>
        <Sub n="6.4">Back up what matters</Sub>
        <P>
          You are responsible for your own copies of anything you cannot afford to lose. The Service
          has no export feature in the current version; if you need one, ask us and we will provide
          your data in a machine-readable form (that is also a right you can invoke, see the Privacy
          Policy).
        </P>
      </>
    ),
  },
  {
    id: "feedback",
    title: "Feedback and suggestions",
    body: (
      <P>
        If you send us ideas, bug reports, feature requests or criticism, you grant us a perpetual,
        irrevocable, royalty-free licence to use them in the product without attribution or payment,
        and you warrant you may. We will not identify you as a source without asking, and we do not
        promise to act on anything — but bug reports with a reproducible step get priority, because
        they help everyone.
      </P>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    body: (
      <>
        <P>
          The Service — its name, marks, interface, design system, layout, code and documentation —
          is owned by us or our licensors and protected by the <Strong>Copyright Act 1987</Strong>{" "}
          (Malaysia) and equivalent laws elsewhere. These Terms give you a right to use it, not a
          right in it.
        </P>
        <L
          items={[
            "Do not copy, imitate or use our marks or product name in a way that suggests affiliation or endorsement.",
            "Do not register a domain, app-store listing or repository name that impersonates the Service.",
            "You may quote and link to our documentation and marketing pages, with attribution.",
          ]}
        />
        <P>
          Third-party components shipped inside the images (React, Next.js, Hono, Prisma, Postgres
          and the rest) stay under their own licences, and those licences’ notices travel with the
          build.
        </P>
      </>
    ),
  },
  {
    id: "self-hosting",
    title: "Self-hosting",
    body: (
      <>
        <P>
          {OPERATOR.productName} is built to be run by its users. If you deploy our images or source
          on infrastructure you control, then:
        </P>
        <L
          ordered
          items={[
            <>
              <Strong>you are the operator.</Strong> You run the servers, you hold the database, and
              in data-protection terms you are the controller. We have no access to it and no
              visibility into it.
            </>,
            <>
              <Strong>our privacy policy describes your obligations to your users,</Strong> not
              ours. Use it as the basis for your own notice — that is what it is written for — but
              publish it under your name, and complete the parts about hosting, retention and
              contact details with your facts.
            </>,
            <>
              <Strong>you must secure it yourself.</Strong> HTTPS behind your proxy,{" "}
              <Code>AUTH_SECRET</Code> set to a real value, a database role with least privilege,
              and the <Code>CORS_ALLOWED_ORIGINS</Code> allow-list configured rather than left open.
            </>,
            <>
              <Strong>the software licence governs the code.</Strong> Whatever licence accompanies
              the release you obtain — see the release notes or the repository — sets what you may
              modify, redistribute or offer as a service. These Terms govern the hosted Service, and
              the licence governs the software; if they conflict about the software, the licence
              controls.
            </>,
            <>
              <Strong>updates and fixes.</Strong> We publish releases; we do not maintain your
              deployment, run your migrations, or accept liability for your installation.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees and taxes",
    body: (
      <>
        <P>
          The hosted Service is currently free to use, so no fee terms apply today. If we introduce
          paid plans, they will be governed by an added section in these Terms (or a separate order
          form), and the price, billing period, renewal and refund mechanics published at the time
          of purchase will apply. Each party bears its own taxes; where a fee exists, prices exclude
          applicable sales, service or similar tax unless stated otherwise.
        </P>
        <P>
          Free does not mean unmanaged: the acceptable-use rules in section 5 and the liability
          position in section 13 apply to a free account exactly as they apply to a paid one.
        </P>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability, support and no warranty",
    body: (
      <>
        <Sub n="11.1">No service level agreement</Sub>
        <P>
          We aim to keep the Service up and we operate it with backups, but we do not promise an
          uptime percentage, an incident-response time, or that any particular feature will remain.
          Planned maintenance may make it unavailable. Self-hosted instances are entirely your
          reliability story.
        </P>
        <Sub n="11.2">Support</Sub>
        <P>
          Support is best-effort, without charge unless a paid plan says otherwise — write to{" "}
          <Mailto />. We will respond to security reports seriously and to data requests within the
          periods promised in the Privacy Policy.
        </P>
        <Sub n="11.3">Warranty disclaimer</Sub>
        <Callout tone="warn" title="This is the important one">
          <P>
            The Service and the software are provided “as is” and “as available”, without warranty
            of any kind, to the maximum extent permitted by law. We do not warrant that the Service
            will be uninterrupted, error-free, secure, accurate, fit for your purpose, or that
            defects will be corrected. To the extent any consumer guarantees or implied terms cannot
            be excluded under the law applicable to you — for example the Malaysian{" "}
            <Strong>Consumer Protection Act 1999</Strong>, Australian Consumer Law, or the UK
            Consumer Rights Act 2015 — nothing in these Terms excludes or limits them; where the law
            allows us to limit a remedy instead of excluding it, we limit it to re-providing the
            service or paying the cost of doing so.
          </P>
        </Callout>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <>
        <Sub n="12.1">By you</Sub>
        <P>
          Stop using the Service at any time, and ask us to delete your account as described in the
          Privacy Policy. Termination ends your licence to use the Service but does not undo the
          agreement that your content sat in a shared container.
        </P>
        <Sub n="12.2">By us</Sub>
        <P>
          We may warn, restrict, suspend or terminate access — including a whole container — if you
          breach these Terms, if we must do so to comply with law or a lawful order, if your use
          creates a security, legal or operational risk for us or other users, or if the Service is
          discontinued. Where it is reasonable and lawful to do so we give notice first and the
          chance to put it right, and we tell you what happens to your data. We will not suspend you
          because someone complained without a reason we can act on.
        </P>
        <Sub n="12.3">On termination</Sub>
        <P>
          Sections 6 (your content, as far as it covers what already happened), 7, 8, 13, 14, 15, 16
          and 17 survive termination, along with any payment obligation you accrued before it.
        </P>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <P>
        If you use the Service in a business context, or you add other people’s personal data to it,
        you agree to hold us harmless against third-party claims, losses and reasonable legal costs
        arising from your content, your use of the Service in breach of these Terms, your breach of
        a duty owed to another person, your failure to have a lawful basis for personal data you put
        into a container, or your own installation of the self-hosted software. We will tell you
        about a claim, and you may not settle one in a way that binds us without our consent. This
        does not apply to the extent a claim results from our own unlawful conduct.
      </P>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <Sub n="14.1">What we are not liable for</Sub>
        <P>
          To the fullest extent permitted by law, we are not liable for loss of profits, revenue,
          goodwill, business opportunities or data, or for indirect, incidental, special or
          consequential loss, however caused and whether in contract, tort (including negligence),
          breach of statutory duty or otherwise, even if we were told it might happen.
        </P>
        <Sub n="14.2">Our cap</Sub>
        <P>
          Our total liability for everything arising out of these Terms or your use of the Service
          is limited to the greater of the fees you paid us in the twelve months before the event
          giving rise to the claim, or <Strong>RM 500</Strong> (or the equivalent in your local
          currency for a non-Malaysian user).
        </P>
        <Sub n="14.3">What is never excluded</Sub>
        <P>Nothing in these Terms excludes or limits liability for:</P>
        <L
          items={[
            "death or personal injury caused by our negligence;",
            "fraud, fraudulent misrepresentation or wilful misconduct;",
            "breach of a statutory duty that cannot be excluded — including, where applicable, the Malaysian Civil Law Act 1956 and the Consumer Protection Act 1999, the Unfair Contract Terms protections in the UK and EU, and the Australian Consumer Law;",
            "any other liability that cannot lawfully be limited or excluded in your jurisdiction.",
          ]}
        />
        <P>
          If a court or regulator decides any part of this section is unenforceable against you, the
          rest stands and we are liable only to the extent this section permits.
        </P>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    body: (
      <>
        <P>
          These Terms are governed by the laws of <Strong>Malaysia</Strong>, and the parties submit
          to the exclusive jurisdiction of the courts of Malaysia.
        </P>
        <Sub n="15.1">Try to sort it out first</Sub>
        <L
          ordered
          items={[
            <>
              Raise it with us in writing — <Mailto />. Most problems here are fixed in a day.
            </>,
            <>
              If we cannot agree within 30 days, the parties will attempt mediation in good faith —
              in Malaysia, for example through the Asian International Arbitration Centre — before
              either starts proceedings.
            </>,
            <>
              Failing that, the Malaysian courts decide, except that a dispute within the
              jurisdiction limits of a small-claims or tribunal forum (in Malaysia, the Tribunal for
              Consumer Claims) may still be brought there.
            </>,
          ]}
        />
        <Sub n="15.2">If you are outside Malaysia</Sub>
        <P>
          You may still rely on the mandatory consumer and data-protection protections of the
          country where you habitually live, and nothing in this section takes them away. Where a
          regulator or court in your country has unavoidable jurisdiction over a claim against you,
          a Malaysian judgment remains enforceable as a debt in accordance with the applicable law.
        </P>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <P>
        We may revise these Terms as the Service and the law change. The version in force is the one
        published at this URL on the day you use the Service, and the “last updated” date at the top
        tells you when it moved. For changes that materially reduce your rights or increase your
        obligations, we will give notice in the product and, where practicable, at least 14 days
        before they take effect. If you do not agree with a change, stop using the Service —
        continuing to use it means you accept the revised Terms. We will keep prior versions
        available on request so you can see what applied to you at the time.
      </P>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <>
        <L
          items={[
            <>
              <Strong>Entire agreement.</Strong> These Terms, together with the{" "}
              <Internal href={LEGAL_DOCS.privacy.href}>Privacy Policy</Internal> and{" "}
              <Internal href={LEGAL_DOCS.cookies.href}>Cookie Policy</Internal>, are the whole
              agreement about the Service and supersede anything said before you accepted them.
            </>,
            <>
              <Strong>Severability.</Strong> If a provision is invalid or unenforceable, it is read
              down as far as needed to make it lawful, and everything else continues.
            </>,
            <>
              <Strong>No waiver.</Strong> Our not enforcing something once is not a waiver, and does
              not stop us enforcing it later.
            </>,
            <>
              <Strong>Assignment.</Strong> You may not assign these Terms without our consent; we
              may assign them in connection with a merger, reorganisation or sale of the business,
              subject to the notice commitment in the Privacy Policy.
            </>,
            <>
              <Strong>No third-party beneficiaries.</Strong> These Terms are between you and us. A
              teammate is not a party to your agreement with us, even though they benefit from your
              not posting their secrets.
            </>,
            <>
              <Strong>Force majeure.</Strong> We are not liable for failure caused by events beyond
              our reasonable control — network outages, upstream provider failures, natural events,
              strikes, war, government action, or a certificate authority doing something unexpected
              — and we will use reasonable efforts to resume.
            </>,
            <>
              <Strong>Notices.</Strong> Notices to us go to the contact below; notices to you may be
              given in the product or at the contact details you provide. There are none to provide,
              because there is no email field: in-product notice is the channel.
            </>,
            <>
              <Strong>Language.</Strong> These Terms are drawn up in English. Any translation is for
              convenience; the English text prevails.
            </>,
            <>
              <Strong>Individual claims.</Strong> To the extent permitted by applicable law,
              disputes are brought on an individual basis and not on behalf of a class. This clause
              is written for jurisdictions where that is enforceable; where it is not, it does not
              apply to you and has no effect.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <P>Questions about these Terms, a report about misuse, or a request about your data:</P>
        <ContactBlock />
        <P>
          The <Internal href={LEGAL_DOCS.privacy.href}>Privacy Policy</Internal> explains what we
          record and how to get it removed; the{" "}
          <Internal href={LEGAL_DOCS.cookies.href}>Cookie Policy</Internal> explains the one cookie
          we set.
        </P>
      </>
    ),
  },
];

export default function TermsOfUsePage() {
  return <LegalDoc meta={LEGAL_DOCS.terms} sections={SECTIONS} also={["privacy", "cookies"]} />;
}
