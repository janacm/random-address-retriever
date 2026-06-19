import {
  Activity,
  Clipboard,
  Database,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Shuffle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { AddressApiError, checkHealth, fetchRandomAddress } from "./api";
import type { HealthResponse, ProvinceCode, RandomAddressResponse } from "./types";
import sourceGuidePage from "../../../docs/reference/NARGuide-002.jpg";

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

type RequestState = "idle" | "loading" | "success" | "error";

function formatAddressForClipboard(result: RandomAddressResponse) {
  const { data } = result;
  const lines = [
    data.address,
    `${data.city}, ${data.province} ${data.postalCode}`,
  ];

  if (data.source) {
    lines.push(`LOC_GUID: ${data.source.locGuid}`);
    lines.push(`ADDR_GUID: ${data.source.addrGuid}`);
  }

  return lines.join("\n");
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
  const [city, setCity] = useState("Burlington");
  const [province, setProvince] = useState<ProvinceCode | "">("ON");
  const [verbose, setVerbose] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RandomAddressResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

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
    } catch (error) {
      setRequestState("error");
      setMessage(getErrorMessage(error));
    }
  }

  async function handleRefresh() {
    const form = document.getElementById("address-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  async function handleCopy() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(formatAddressForClipboard(result));
    setMessage("Address copied.");
  }

  async function handleHealthCheck() {
    setMessage("");

    try {
      setHealth(await checkHealth());
      setMessage("API healthy.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">National Address Register</p>
          <h1>Random Address Retriever</h1>
        </div>
        <div className="topbarMeta" aria-label="Local database status">
          <Database aria-hidden="true" size={18} />
          <span>17,169,294 rows</span>
        </div>
      </header>

      <section className="workbench" aria-label="Address retrieval workspace">
        <form id="address-form" className="panel queryPanel" onSubmit={handleSubmit}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Lookup</p>
              <h2>Address query</h2>
            </div>
            <Shuffle aria-hidden="true" size={22} />
          </div>

          <label className="field">
            <span>City</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Burlington"
              autoComplete="address-level2"
            />
          </label>

          <label className="field">
            <span>Province</span>
            <select
              value={province}
              onChange={(event) => setProvince(event.target.value as ProvinceCode | "")}
            >
              {PROVINCES.map((option) => (
                <option key={option.code || "all"} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="toggleRow">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(event) => setVerbose(event.target.checked)}
            />
            <span>Source identifiers</span>
          </label>

          <button className="primaryButton" type="submit" disabled={requestState === "loading"}>
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
                    {result.data.city}, {result.data.province} {result.data.postalCode}
                  </span>
                </div>
              </div>

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
              <p>No address loaded.</p>
            </div>
          )}

          {message ? (
            <p className={requestState === "error" ? "statusMessage error" : "statusMessage"}>
              {message}
            </p>
          ) : null}
        </section>

        <aside className="sideRail" aria-label="Source and API status">
          <section className="panel guidePanel">
            <div className="guideImageWrap">
              <img src={sourceGuidePage} alt="National Address Register guide summary page" />
            </div>
            <div className="guideBody">
              <p className="eyebrow">Source</p>
              <h2>Statistics Canada NAR</h2>
              <span>CSV import backed by local Postgres</span>
            </div>
          </section>

          <section className="panel healthPanel">
            <div className="panelHeader compact">
              <div>
                <p className="eyebrow">API</p>
                <h2>Local service</h2>
              </div>
              <ShieldCheck aria-hidden="true" size={20} />
            </div>
            <button className="secondaryButton" type="button" onClick={handleHealthCheck}>
              <Activity aria-hidden="true" size={18} />
              <span>Check API</span>
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
          </section>
        </aside>
      </section>
    </main>
  );
}
