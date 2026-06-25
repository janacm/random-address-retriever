import { useState } from "react";
import {
  Activity,
  Bug,
  Database,
  Globe2,
  MessageSquarePlus,
  ShieldCheck,
} from "lucide-react";
import { checkHealth } from "./api";
import { NetlifyForm, type NetlifyFieldDef } from "./components/NetlifyForm";
import type { View } from "./nav";
import type { HealthResponse } from "./types";
import sourceGuidePage from "../../../docs/reference/NARGuide-002.jpg";

const API_ACCESS_FIELDS: NetlifyFieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "Jane Doe" },
  {
    name: "email",
    label: "Email",
    type: "email",
    required: true,
    placeholder: "you@example.com",
  },
  {
    name: "organization",
    label: "Company / project",
    type: "text",
    placeholder: "Acme Inc.",
  },
  {
    name: "message",
    label: "Tell us about your use case",
    type: "textarea",
    required: true,
    placeholder: "What are you building, and roughly how many lookups per month?",
  },
];

const FEEDBACK_FIELDS: NetlifyFieldDef[] = [
  {
    name: "email",
    label: "Email (optional, if you'd like a reply)",
    type: "email",
    placeholder: "you@example.com",
  },
  {
    name: "message",
    label: "Details",
    type: "textarea",
    required: true,
    placeholder: "What happened, or what would you like to see?",
  },
];

export function ApiAccessView() {
  return (
    <section className="page apiPage" aria-label="API access">
      <div className="pageIntro">
        <p className="eyebrow">API access</p>
        <h2>Build on the address index</h2>
        <p>
          The same data behind this tool is available as a simple JSON API. Tell us a
          little about what you&rsquo;re building and we&rsquo;ll get you a key.
        </p>
      </div>

      <div className="tierGrid">
        <div className="tierCard">
          <p className="eyebrow">Free tier</p>
          <h3>Hobby &amp; evaluation</h3>
          <ul>
            <li>Random address lookups by province &amp; city</li>
            <li>City typeahead endpoint</li>
            <li>Generous rate limit for low-volume use</li>
          </ul>
          <p className="tierPrice">Free</p>
        </div>
        <div className="tierCard featured">
          <p className="eyebrow">Paid</p>
          <h3>Production &amp; high volume</h3>
          <ul>
            <li>Higher rate limits &amp; bulk access</li>
            <li>Verbose source identifiers (LOC / ADDR GUIDs)</li>
            <li>Priority support</li>
          </ul>
          <p className="tierPrice">Let&rsquo;s talk</p>
        </div>
      </div>

      <div className="calloutCard">
        <Globe2 aria-hidden="true" size={24} />
        <div>
          <h3>Want this for your country?</h3>
          <p>
            We&rsquo;ve indexed every real address in Canada. If you want the same
            coverage for another country, reach out — pick
            &ldquo;This, but for another country&rdquo; below and tell us where.
          </p>
        </div>
      </div>

      <div className="formCard">
        <h3>Request access</h3>
        <NetlifyForm
          formName="api-access"
          fields={API_ACCESS_FIELDS}
          submitLabel="Request access"
          successTitle="Thanks — we got it."
          successMessage="We'll be in touch at the email you provided. No spam."
        />
      </div>
    </section>
  );
}

function HealthCard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleHealthCheck() {
    setMessage("");
    setIsError(false);
    setChecking(true);

    try {
      setHealth(await checkHealth());
      setMessage("API healthy.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="panel healthPanel">
      <div className="panelHeader compact">
        <div>
          <p className="eyebrow">API</p>
          <h2>Service status</h2>
        </div>
        <ShieldCheck aria-hidden="true" size={20} />
      </div>
      <button
        className="secondaryButton"
        type="button"
        onClick={handleHealthCheck}
        disabled={checking}
      >
        <Activity aria-hidden="true" size={18} />
        <span>{checking ? "Checking…" : "Check API"}</span>
      </button>
      <dl className="healthList">
        <div>
          <dt>Endpoint</dt>
          <dd>127.0.0.1:8787</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>{health?.data.database ?? "Not checked"}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{health ? `${health.data.durationMs} ms` : "Not checked"}</dd>
        </div>
      </dl>
      {message ? (
        <p className={isError ? "statusMessage error" : "statusMessage"}>{message}</p>
      ) : null}
    </section>
  );
}

export function AboutView() {
  return (
    <section className="page aboutPage" aria-label="About this tool">
      <div className="pageIntro">
        <p className="eyebrow">About</p>
        <h2>Where these addresses come from</h2>
        <p>
          Every result is a real Canadian address drawn at random from Statistics
          Canada&rsquo;s National Address Register (NAR) — 17,169,294 rows imported
          into a local Postgres database. No address is invented; each one maps back
          to the source identifiers in the register.
        </p>
        <p className="disclaimerNote">
          This is an independent project. It is not affiliated with, endorsed by, or
          officially associated with Statistics Canada or any Government of Canada
          department.
        </p>
        <p className="attributionNote">
          Adapted from Statistics Canada, National Address Register. This does not
          constitute an endorsement by Statistics Canada of this product. The register
          is available under the{" "}
          <a
            href="https://www.statcan.gc.ca/en/reference/licence"
            target="_blank"
            rel="noopener noreferrer"
          >
            Statistics Canada Open Licence
          </a>{" "}
          and contains information licensed under the{" "}
          <a
            href="https://open.yukon.ca/open-government-licence-yukon"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Government Licence – Yukon
          </a>
          .
        </p>
      </div>

      <div className="aboutGrid">
        <section className="panel guidePanel">
          <div className="guideImageWrap">
            <img
              src={sourceGuidePage}
              alt="National Address Register guide summary page"
            />
          </div>
          <div className="guideBody">
            <p className="eyebrow">Source</p>
            <h2>Statistics Canada NAR</h2>
            <span>CSV import backed by local Postgres</span>
          </div>
        </section>

        <HealthCard />
      </div>

      <div className="formCard" id="feedback">
        <div className="formCardHead">
          <MessageSquarePlus aria-hidden="true" size={22} />
          <div>
            <h3>Feedback, bugs &amp; feature requests</h3>
            <p>
              Spotted a wrong address, hit an error, or want a new feature? Let us
              know.
            </p>
          </div>
        </div>
        <NetlifyForm
          formName="feedback"
          fields={FEEDBACK_FIELDS}
          submitLabel="Send feedback"
          successTitle="Thanks for the feedback!"
          successMessage="We read every submission and use it to prioritize what's next."
        />
      </div>
    </section>
  );
}

export function TermsView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="page legalPage" aria-label="Terms of Service">
      <div className="pageIntro">
        <p className="eyebrow">Legal</p>
        <h2>Terms of Service</h2>
        <p className="legalUpdated">Last updated: June 2026</p>
      </div>
      <div className="legalBody">
        <p>
          Random Address Retriever (&ldquo;the Service&rdquo;) is provided on an
          &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without warranties
          of any kind. By using the Service you agree to these terms.
        </p>
        <h3>Acceptable use</h3>
        <p>
          The Service is intended for development, testing, and research. You agree not
          to use it to harass individuals, to misrepresent generated addresses as
          verified or current, or to place undue load on the infrastructure.
        </p>
        <h3>Data &amp; accuracy</h3>
        <p>
          Addresses are adapted from Statistics Canada&rsquo;s National Address
          Register, available under the Statistics Canada Open Licence and containing
          information licensed under the Open Government Licence – Yukon. This does not
          constitute an endorsement by Statistics Canada of the Service. The data may be
          incomplete, outdated, or otherwise inaccurate and should not be relied upon for
          any official, legal, or emergency purpose.
        </p>
        <h3>No affiliation</h3>
        <p>
          This is an independent project and is not affiliated with, endorsed by, or
          officially associated with Statistics Canada or any Government of Canada
          department.
        </p>
        <h3>Changes</h3>
        <p>
          We may update these terms from time to time. Continued use of the Service
          after changes constitutes acceptance of the revised terms.
        </p>
        <p>
          Questions? Use the{" "}
          <button type="button" className="inlineLink" onClick={() => onNavigate("about")}>
            feedback form
          </button>
          .
        </p>
      </div>
    </section>
  );
}

export function PrivacyView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="page legalPage" aria-label="Privacy Policy">
      <div className="pageIntro">
        <p className="eyebrow">Legal</p>
        <h2>Privacy Policy</h2>
        <p className="legalUpdated">Last updated: June 2026</p>
      </div>
      <div className="legalBody">
        <p>
          We aim to collect as little as possible. This policy explains what we
          collect and why.
        </p>
        <h3>Address lookups</h3>
        <p>
          Province and city queries are sent to our API to return a random address. We
          do not require an account and do not build a profile of your searches.
        </p>
        <h3>Forms you submit</h3>
        <p>
          When you submit the API access or feedback forms, the information you enter
          (such as your name, email, and message) is processed through Netlify Forms so
          we can respond. We use it only to reply to you and to improve the Service.
        </p>
        <h3>Analytics &amp; cookies</h3>
        <p>
          The Service does not set advertising cookies. Any hosting-level logs are used
          only to keep the Service running and secure.
        </p>
        <h3>Contact</h3>
        <p>
          To ask about your data, use the{" "}
          <button type="button" className="inlineLink" onClick={() => onNavigate("about")}>
            feedback form
          </button>
          .
        </p>
      </div>
    </section>
  );
}

export function SiteFooter({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="siteFooter">
      <div className="footerInner">
        <div className="footerBrand">
          <Database aria-hidden="true" size={16} />
          <span>Random Address Retriever 🍁</span>
        </div>
        <p className="footerDisclaimer">
          <strong>Independent project.</strong> Not affiliated with, endorsed by, or
          officially associated with Statistics Canada or any Government of Canada
          department. Address data is derived from the publicly available National
          Address Register.
        </p>
        <p className="footerAttribution">
          Adapted from Statistics Canada, National Address Register. This does not
          constitute an endorsement by Statistics Canada of this product. Available
          under the{" "}
          <a
            href="https://www.statcan.gc.ca/en/reference/licence"
            target="_blank"
            rel="noopener noreferrer"
          >
            Statistics Canada Open Licence
          </a>
          ; contains information licensed under the{" "}
          <a
            href="https://open.yukon.ca/open-government-licence-yukon"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Government Licence – Yukon
          </a>
          .
        </p>
        <nav className="footerLinks" aria-label="Legal and contact">
          <button type="button" onClick={() => onNavigate("terms")}>
            Terms of Service
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => onNavigate("privacy")}>
            Privacy Policy
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => onNavigate("about")}>
            <Bug aria-hidden="true" size={14} /> Feedback
          </button>
        </nav>
        <p className="footerCopy">© 2026 Random Address Retriever</p>
      </div>
    </footer>
  );
}
