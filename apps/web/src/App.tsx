import {
  Clipboard,
  Database,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  Shuffle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import { AddressApiError, fetchRandomAddress } from "./api";
import { CityCombobox } from "./components/CityCombobox";
import type { View } from "./nav";
import {
  AboutView,
  ApiAccessView,
  PrivacyView,
  SiteFooter,
  TermsView,
} from "./views";
import type { ProvinceCode, RandomAddressResponse } from "./types";

const PROVINCES: Array<{ code: ProvinceCode | ""; name: string }> = [
  { code: "", name: "All provinces" },
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const NAV: Array<{ key: View; label: string }> = [
  { key: "retriever", label: "Retriever" },
  { key: "api", label: "API access" },
  { key: "about", label: "About" },
];

type RequestState = "idle" | "loading" | "success" | "error";

function formatAddressForClipboard(result: RandomAddressResponse) {
  const { data } = result;
  const lines = [data.address, `${data.city}, ${data.province} ${data.postalCode}`];

  if (data.source) {
    lines.push(`LOC_GUID: ${data.source.locGuid}`);
    lines.push(`ADDR_GUID: ${data.source.addrGuid}`);
  }

  return lines.join("\n");
}

// Build a Google Maps search link from the address text — no API key or call
// required. Maps resolves the query string the same way the search box does.
function googleMapsUrl(result: RandomAddressResponse): string {
  const { data } = result;
  const query = [data.address, data.city, data.province, data.postalCode, "Canada"]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof AddressApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected request failure.";
}

export function App() {
  const posthog = usePostHog();
  const [view, setView] = useState<View>("retriever");
  const [city, setCity] = useState("Burlington");
  const [province, setProvince] = useState<ProvinceCode | "">("ON");
  const [verbose, setVerbose] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RandomAddressResponse | null>(null);

  const selectedProvince = useMemo(
    () => PROVINCES.find((option) => option.code === province)?.name ?? "All provinces",
    [province]
  );

  const queryLabel = useMemo(() => {
    const trimmedCity = city.trim() || "Burlington";
    return province ? `${trimmedCity}, ${province}` : trimmedCity;
  }, [city, province]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestState("loading");
    setMessage("");

    try {
      const response = await fetchRandomAddress({
        city: city.trim() || "Burlington",
        province,
        verbose,
      });
      setResult(response);
      setRequestState("success");
      posthog?.capture("address_retrieved", {
        city: response.data.city,
        province: response.data.province,
        postal_code: response.data.postalCode,
        verbose,
        query_duration_ms: response.meta.durationMs,
      });
    } catch (error) {
      setRequestState("error");
      const errorMessage = getErrorMessage(error);
      setMessage(errorMessage);
      posthog?.capture("address_retrieval_failed", {
        city: city.trim() || "Burlington",
        province,
        error_message: errorMessage,
        error_status: error instanceof AddressApiError ? error.status : undefined,
      });
    }
  }

  function handleRefresh() {
    const form = document.getElementById("address-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  async function handleCopy() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(formatAddressForClipboard(result));
    setMessage("Address copied.");
    posthog?.capture("address_copied", {
      city: result.data.city,
      province: result.data.province,
      postal_code: result.data.postalCode,
    });
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">
            🍁
          </span>
          <div>
            <p className="eyebrow">National Address Register</p>
            <button
              type="button"
              className="brandTitle"
              onClick={() => setView("retriever")}
            >
              <h1>Random Address Retriever</h1>
            </button>
          </div>
        </div>

        <div className="topbarRight">
          <nav className="topnav" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={view === item.key ? "navLink active" : "navLink"}
                aria-current={view === item.key ? "page" : undefined}
                onClick={() => setView(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="topbarMeta" aria-label="Local database status">
            <Database aria-hidden="true" size={18} />
            <span>17,169,294 rows</span>
          </div>
        </div>
      </header>

      <div className="viewport">
        {view === "retriever" ? (
          <>
            <section className="hero" aria-label="Overview">
              <p className="heroKicker">🍁 Every Canadian address, one query away</p>
              <h2 className="heroTitle">We&rsquo;ve indexed every real address in Canada</h2>
              <p className="heroSub">
                All 17,169,294 addresses from Statistics Canada&rsquo;s National Address
                Register, searchable by province and city. Pick a place, get a real,
                randomly chosen address.
              </p>
            </section>

            <section className="workbench" aria-label="Address retrieval workspace">
              <form id="address-form" className="panel queryPanel" onSubmit={handleSubmit}>
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Start here</p>
                    <h2>Get a random address</h2>
                  </div>
                  <Shuffle aria-hidden="true" size={22} />
                </div>

                <p className="panelLead">
                  Choose a province and city, then press <strong>Get address</strong>.
                </p>

                <label className="field">
                  <span>Province</span>
                  <select
                    value={province}
                    onChange={(event) =>
                      setProvince(event.target.value as ProvinceCode | "")
                    }
                  >
                    {PROVINCES.map((option) => (
                      <option key={option.code || "all"} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <span className="fieldHint">
                    Start here — pick a province, or search all of Canada.
                  </span>
                </label>

                <div className="field">
                  <span className="fieldLabel">City</span>
                  <CityCombobox
                    value={city}
                    onChange={setCity}
                    province={province}
                    placeholder="Start typing a city…"
                    inputId="city-input"
                  />
                  <span className="fieldHint">
                    Then search for a city — pick one from the indexed list.
                  </span>
                </div>

                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={verbose}
                    onChange={(event) => setVerbose(event.target.checked)}
                  />
                  <span>Source identifiers</span>
                </label>

                <button
                  className="primaryButton"
                  type="submit"
                  disabled={requestState === "loading"}
                >
                  {requestState === "loading" ? (
                    <RefreshCw className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <Search aria-hidden="true" size={18} />
                  )}
                  <span>{requestState === "loading" ? "Retrieving" : "Get address"}</span>
                </button>

                <div className="querySummary">
                  <span>Query</span>
                  <strong>{queryLabel}</strong>
                  <small>{selectedProvince}</small>
                </div>
              </form>

              <section className="panel resultPanel" aria-live="polite">
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Result</p>
                    <h2>Retrieved address</h2>
                  </div>
                  <div className="iconActions">
                    <button
                      className="iconButton"
                      type="button"
                      onClick={handleRefresh}
                      title="Refresh address"
                      aria-label="Refresh address"
                      disabled={requestState === "loading"}
                    >
                      <RefreshCw aria-hidden="true" size={18} />
                    </button>
                    <button
                      className="iconButton"
                      type="button"
                      onClick={handleCopy}
                      title="Copy address"
                      aria-label="Copy address"
                      disabled={!result}
                    >
                      <Clipboard aria-hidden="true" size={18} />
                    </button>
                  </div>
                </div>

                {result ? (
                  <div className="resultContent">
                    <div className="addressBlock">
                      <MapPin aria-hidden="true" size={22} />
                      <div>
                        <p>{result.data.address}</p>
                        <span>
                          {result.data.city}, {result.data.province}{" "}
                          {result.data.postalCode}
                        </span>
                      </div>
                    </div>

                    <a
                      className="mapsLink"
                      href={googleMapsUrl(result)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin aria-hidden="true" size={16} />
                      <span>View on Google Maps</span>
                      <ExternalLink aria-hidden="true" size={14} />
                    </a>

                    <dl className="metricGrid">
                      <div>
                        <dt>City</dt>
                        <dd>{result.data.city}</dd>
                      </div>
                      <div>
                        <dt>Province</dt>
                        <dd>{result.data.province}</dd>
                      </div>
                      <div>
                        <dt>Postal code</dt>
                        <dd>{result.data.postalCode}</dd>
                      </div>
                      <div>
                        <dt>Query time</dt>
                        <dd>{result.meta.durationMs} ms</dd>
                      </div>
                    </dl>

                    {result.data.source ? (
                      <dl className="sourceList">
                        <div>
                          <dt>LOC_GUID</dt>
                          <dd>{result.data.source.locGuid}</dd>
                        </div>
                        <div>
                          <dt>ADDR_GUID</dt>
                          <dd>{result.data.source.addrGuid}</dd>
                        </div>
                      </dl>
                    ) : null}
                  </div>
                ) : (
                  <div className="emptyState">
                    <MapPin aria-hidden="true" size={32} />
                    <p>No address yet</p>
                    <span>
                      Pick a province and city on the left, then press Get address.
                    </span>
                  </div>
                )}

                {message ? (
                  <p
                    className={
                      requestState === "error" ? "statusMessage error" : "statusMessage"
                    }
                  >
                    {message}
                  </p>
                ) : null}
              </section>
            </section>
          </>
        ) : null}

        {view === "api" ? <ApiAccessView /> : null}
        {view === "about" ? <AboutView /> : null}
        {view === "terms" ? <TermsView onNavigate={setView} /> : null}
        {view === "privacy" ? <PrivacyView onNavigate={setView} /> : null}
      </div>

      <SiteFooter onNavigate={setView} />
    </div>
  );
}
