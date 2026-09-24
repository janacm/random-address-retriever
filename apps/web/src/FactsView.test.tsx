import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FactsData } from "./facts";
import { FACT_SECTIONS, FactsView } from "./FactsView";

// FACTS is read through a getter so a test can swap in altered data (other
// tie shapes, a different release) and check the copy adapts instead of
// stating something the data no longer says.
const holder = vi.hoisted(() => ({ facts: null as FactsData | null }));
vi.mock("./facts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./facts")>();
  return {
    get FACTS() {
      return holder.facts ?? actual.FACTS;
    },
  };
});

async function realFacts(): Promise<FactsData> {
  const actual = await vi.importActual<typeof import("./facts")>("./facts");
  return structuredClone(actual.FACTS);
}

afterEach(() => {
  holder.facts = null;
});

const FACT_ORDER = [
  "tiny-municipality-counts",
  "one-address-municipalities",
  "mean-vs-median",
  "top-10-municipalities",
  "biggest-city",
  "size-buckets",
  "half-of-addresses",
  "montreal-most-buildings",
  "toronto-vs-atlantic",
  "nunavut-vs-la-sarre",
  "oakville-biggest-town",
  "smallest-cities",
  "per-province-extremes",
  "same-name-same-province",
  "shared-names-across-provinces",
  "longest-shortest-names",
  "quebec-saints-and-ha-ha",
  "most-common-street-name-main",
  "principale-has-more-buildings-than-main",
  "most-repeated-street-address",
  "busiest-single-street",
  "fun-street-names",
  "island-addresses",
  "most-common-street-direction",
  "most-common-civic-number",
  "highest-civic-number",
  "civic-suffixes-fractions-zero",
  "biggest-building",
  "single-address-buildings",
  "basement-units",
  "house-description-labels",
  "geographic-extremes",
  "loneliest-building",
  "latitude-bands",
  "single-address-fsas",
];

function card(container: HTMLElement, fact: string) {
  const el = container.querySelector<HTMLElement>(`[data-fact="${fact}"]`);
  if (!el) throw new Error(`no card for ${fact}`);
  return el;
}

describe("FactsView", () => {
  it("says the facts come from the full register, not the retriever's sample", () => {
    render(<FactsView />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Facts from the National Address Register" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Counted from the full register" })).toBeInTheDocument();
    expect(screen.getByText(/picks from a smaller sample of the register/)).toBeInTheDocument();
  });

  it("leads with the key numbers", () => {
    render(<FactsView />);
    const stats = within(screen.getByLabelText("Key numbers"));
    expect(stats.getByText("4,163")).toBeInTheDocument();
    expect(stats.getByText("4,120.5")).toBeInTheDocument();
    expect(stats.getByText("429")).toBeInTheDocument();
    expect(stats.getByText("536")).toBeInTheDocument();
    expect(stats.getByText("94")).toBeInTheDocument();
    expect(stats.getByText("Toronto (1,316,783)")).toBeInTheDocument();
  });

  it("renders the requested facts first, then the rest, in order", () => {
    const { container } = render(<FactsView />);
    const rendered = [...container.querySelectorAll("[data-fact]")].map((el) => el.getAttribute("data-fact"));
    expect(rendered).toEqual(FACT_ORDER);
  });

  it("lists every municipality tied for smallest with its one address", () => {
    render(<FactsView />);
    const table = screen.getByRole("region", { name: "All 94 one-address municipalities, by province" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(94);
    expect(within(table).getByText("14 Main ST, BIRCHY HEAD NL A0K 1K0")).toBeInTheDocument();
    expect(within(table).getByText("460 Qitsualuk RD, IVUJIVIK QC J0M 1H0")).toBeInTheDocument();
    expect(rows.filter((r) => r.classList.contains("highlight"))).toHaveLength(2);
    expect(screen.getByText(/There is no single smallest municipality/)).toHaveTextContent(
      "4 Newfoundland and Labrador towns (Keels, Little Bay Islands, St. Lewis and West St. Modeste)"
    );
  });

  it("answers the mean, median, most addresses, biggest city and top 5", () => {
    const { container } = render(<FactsView />);
    expect(
      screen.getByRole("heading", {
        name: "The mean is 4,120.5 addresses per municipality and the median is 429",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Toronto has the most addresses: 1,316,783" })).toBeInTheDocument();
    expect(card(container, "top-10-municipalities")).toHaveTextContent(
      "The top 5 (Toronto, Montréal, Calgary, Edmonton and Ottawa) hold 21.98% of them"
    );
    expect(screen.getByRole("heading", { name: "Toronto is also the biggest legal city" })).toBeInTheDocument();
    expect(card(container, "biggest-city")).toHaveTextContent("so the two readings agree");
    const top10 = screen.getByRole("region", { name: "Top 10 municipalities by addresses" });
    expect(within(top10).getAllByRole("row")).toHaveLength(11);
  });

  it("names or points to every tied smallest municipality in the province table", () => {
    render(<FactsView />);
    const table = screen.getByRole("region", {
      name: "Largest and smallest municipality by province and territory",
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(13);
    const row = (prov: string) => rows.find((r) => r.firstElementChild?.textContent === prov);
    expect(row("SK")).toHaveTextContent("31 tied at 1 address, all in the table above");
    expect(row("PE")).toHaveTextContent("Morell 2 (10 addresses)");
    expect(row("QC")).toHaveTextContent(
      "4 tied at 1 address: Ivujivik; Picard; Saint-Louis-de-Gonzague-du-Cap-Tourmente and Sault-au-Cochon"
    );
    expect(screen.getByText(/The largest municipality is a city or ville everywhere/)).toHaveTextContent(
      "except Nova Scotia, where Halifax is a regional municipality (RGM)"
    );
  });

  it("lists both addresses tied for the 4th most repeated street address", () => {
    const { container } = render(<FactsView />);
    expect(card(container, "most-repeated-street-address")).toHaveTextContent(
      "then 10 Main ST and 15 Main ST, tied at 103"
    );
  });

  it("says which provinces it takes for Principale to pass Main", () => {
    const { container } = render(<FactsView />);
    expect(card(container, "principale-has-more-buildings-than-main")).toHaveTextContent(
      "but on its own it would fall short of Main. Adding New Brunswick (3,382) puts it ahead, and Ontario (697) and Manitoba (88) add the rest."
    );
  });

  it("explains the gap between mean and median with the largest municipalities", () => {
    const { container } = render(<FactsView />);
    expect(card(container, "mean-vs-median")).toHaveTextContent(
      "The 24 municipalities with 100,000 or more addresses hold 43.1% of the total"
    );
  });

  it("links each section from the table of contents", () => {
    const { container } = render(<FactsView />);
    const toc = screen.getByRole("navigation", { name: "Facts sections" });
    const links = within(toc).getAllByRole("link");
    expect(links).toHaveLength(FACT_SECTIONS.length);
    for (const link of links) {
      const id = link.getAttribute("href")?.slice(1) ?? "";
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it("keeps the copy free of em dashes and broken interpolation", () => {
    const { container } = render(<FactsView />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });
});

describe("FactsView with other data shapes", () => {
  it("adjusts the wording when ties, leaders and counts change", async () => {
    const f = await realFacts();
    const towns = f.smallestMunicipalities.municipalities.filter((m) => m.csdType === "T");
    towns[0].province = "PE";
    f.smallestMunicipalities.byType = f.smallestMunicipalities.byType.filter((t) => t.csdType !== "IRI");
    f.extremes.northernmostInQuebec.municipality = "Somewhere else";
    f.biggestCity.largestCity.name = "Another City";
    f.biggestCity.top10AllCityOrVille = false;
    f.sizeBands.bands = f.sizeBands.bands.filter((b) => b.band !== "100-999");
    f.sizeBands.atLeast1m = 2;
    f.mostBuildings.top.forEach((b) => (b.addressRank += 1));
    f.provinceExtremes.forEach((r) => r.biggest.forEach((b) => (b.csdType = "CY")));
    f.sameNameSameProvince.byProvince = f.sameNameSameProvince.byProvince.filter((p) => p.province !== "QC");
    f.sharedNames.names = f.sharedNames.names.slice(0, 1);
    f.nameLengths.longestStreet[0].addresses = 2;
    f.quebecSaints.exclamationMunicipalities.push({ name: "Wow!", province: "QC", addresses: 2 });
    f.quebecSaints.exclamationStreets.push({ street: "Yes! ST", municipality: "Wow!", province: "QC", addresses: 1 });
    f.repeatedAddresses.top = f.repeatedAddresses.top.slice(0, 4);
    f.mainStreet.byMunicipalities = f.mainStreet.byMunicipalities.slice(0, 5);
    f.civicSuffixes.letterKinds = 20;
    f.highestCivic.sevenPlusDigit = 1;
    f.biggestBuildings.top[0].distinctUnitLabels -= 1;
    f.extremes.points[0].address = "1 Polar ST";
    f.loneliest.top[0].municipalityAddresses = 5;
    f.loneliest.top = f.loneliest.top.slice(0, 2);
    f.tinyMunicipalities.skRuralMunicipalities.median = 11.5;
    f.tinyMunicipalities.under25Reserves = 10;
    f.sharedNames.spellingVariants[0].provinces = 5;
    f.principale.buildingsByProvince[0].buildings = 60000;
    holder.facts = f;

    const { container } = render(<FactsView />);
    const text = (fact: string) => card(container, fact).textContent ?? "";

    expect(text("one-address-municipalities")).toContain("0 First Nations reserves");
    expect(text("one-address-municipalities")).toContain("4 towns (Keels, PE; Little Bay Islands, NL;");
    expect(text("one-address-municipalities")).not.toContain("northernmost geocoded address in Quebec");
    expect(text("biggest-city")).not.toContain("two readings agree");
    expect(text("biggest-city")).not.toContain("Every municipality in the top 10");
    expect(text("size-buckets")).toContain("2 pass a million.");
    expect(text("size-buckets")).not.toContain("have 100 to 999 addresses");
    expect(text("montreal-most-buildings")).toContain("more buildings than anywhere else");
    expect(text("per-province-extremes")).toContain("a city or ville everywhere. How much");
    expect(text("same-name-same-province")).not.toContain("Quebec has");
    expect(text("shared-names-across-provinces")).not.toContain("each appear in");
    expect(text("longest-shortest-names")).toContain("has 2 addresses, including:");
    expect(text("quebec-saints-and-ha-ha")).toContain("These municipality names have exclamation marks");
    expect(text("quebec-saints-and-ha-ha")).toContain("Streets that share them");
    expect(text("most-repeated-street-address")).toContain("then 10 Main ST (103).");
    expect(text("most-common-street-name-main")).not.toContain("6th is");
    expect(text("civic-suffixes-fractions-zero")).toContain("20 letters");
    expect(text("highest-civic-number")).not.toContain("none has seven");
    expect(text("biggest-building")).not.toContain("its own unit label");
    expect(text("geographic-extremes")).not.toContain("has no civic number or street");
    expect(text("loneliest-building")).toContain("59 Aspen RD in Fort Liard, NT is 150.8 km");
    expect(text("loneliest-building")).not.toContain("Third place");
    expect(text("tiny-municipality-counts")).toContain("The small ones include First Nations reserves");
    expect(text("tiny-municipality-counts")).toContain("the median one has 11.5 addresses");
    expect(text("shared-names-across-provinces")).toContain("puts it in 5 provinces.");
    expect(text("principale-has-more-buildings-than-main")).toContain("(60,000), enough on its own to pass Main.");
  });

  it("names every province Principale needs when all of them are needed", async () => {
    const f = await realFacts();
    f.principale.byBuildings[1].buildings = 53000;
    holder.facts = f;
    const { container } = render(<FactsView />);
    expect(card(container, "principale-has-more-buildings-than-main")).toHaveTextContent(
      "Adding New Brunswick (3,382), Ontario (697) and Manitoba (88) puts it ahead. Full names"
    );
  });
});
