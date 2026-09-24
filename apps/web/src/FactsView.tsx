import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { FACTS } from "./facts";
import {
  countOf,
  csdTypeLabel,
  csdTypeName,
  csdTypeWord,
  describeSmallest,
  formatNumber as n,
  formatPct as pct,
  formatShare,
  isCityOrVille,
  joinList,
  ordinal,
} from "./factsFormat";

// Copy is built with template strings rather than JSX text so that numbers and
// words can never lose the space between them at a line break.

const PROVINCE_NAMES: Record<string, string> = {
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  QC: "Quebec",
  ON: "Ontario",
  MB: "Manitoba",
  SK: "Saskatchewan",
  AB: "Alberta",
  BC: "British Columbia",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};

export const FACT_SECTIONS = [
  { id: "facts-smallest", label: "Smallest" },
  { id: "facts-average", label: "Averages" },
  { id: "facts-largest", label: "Largest" },
  { id: "facts-size", label: "Size" },
  { id: "facts-provinces", label: "Provinces" },
  { id: "facts-names", label: "Names" },
  { id: "facts-streets", label: "Streets" },
  { id: "facts-numbers", label: "Civic numbers" },
  { id: "facts-buildings", label: "Buildings" },
  { id: "facts-geography", label: "Geography" },
  { id: "facts-method", label: "Method" },
] as const;

type SectionId = (typeof FACT_SECTIONS)[number]["id"];

function FactSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: SectionId;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="factSection" id={id} aria-labelledby={`${id}-title`}>
      <div className="factSectionHead">
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={`${id}-title`}>{title}</h3>
      </div>
      <div className="factGrid">{children}</div>
    </section>
  );
}

function FactCard({
  fact,
  title,
  wide = false,
  children,
}: {
  fact: string;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={wide ? "factCard wide" : "factCard"} data-fact={fact}>
      <h4>{title}</h4>
      {children}
    </article>
  );
}

function TypeCode({ code }: { code: string }) {
  const name = csdTypeName(code);
  return name ? <abbr title={name}>{code}</abbr> : <>{code}</>;
}

function Table({
  caption,
  tall = false,
  children,
}: {
  caption: string;
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={tall ? "tableWrap tall" : "tableWrap"} role="region" aria-label={caption} tabIndex={0}>
      <table className="factTable">
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <td className="num">{children}</td>;
}

function NumHead({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="num">
      {children}
    </th>
  );
}

function place(name: string, province: string) {
  return `${name}, ${province}`;
}

/** "4 Newfoundland and Labrador towns (A, B, C and D)" or a mixed-province list. */
function townsPhrase(towns: Array<{ name: string; province: string }>) {
  const provinces = new Set(towns.map((t) => t.province));
  if (provinces.size === 1) {
    const [only] = provinces;
    return `${n(towns.length)} ${PROVINCE_NAMES[only]} towns (${joinList(towns.map((t) => t.name))})`;
  }
  return `${n(towns.length)} towns (${joinList(
    towns.map((t) => place(t.name, t.province)),
    "; "
  )})`;
}

function SmallestSection() {
  const tiny = FACTS.tinyMunicipalities;
  const smallest = FACTS.smallestMunicipalities;
  const lbi = FACTS.littleBayIslands;
  const quebecNorth = FACTS.extremes.northernmostInQuebec;
  const reserves = smallest.byType.find((t) => t.csdType === "IRI")?.municipalities ?? 0;
  const towns = smallest.municipalities.filter((m) => m.csdType === "T");
  const ivujivik = smallest.municipalities.find((m) => m.name === quebecNorth.municipality);
  const highlighted = new Set(["Little Bay Islands", quebecNorth.municipality]);
  const skRm = tiny.skRuralMunicipalities;
  const mostlyReservesAndRms = 2 * (tiny.under25Reserves + tiny.under25RuralMunicipalities) > tiny.under25;

  return (
    <FactSection id="facts-smallest" eyebrow="Smallest" title="Municipalities with the fewest addresses">
      <FactCard
        fact="tiny-municipality-counts"
        title={`${n(tiny.under25)} municipalities have fewer than 25 addresses`}
        wide
      >
        <p>
          {`Of the ${n(tiny.municipalities)} municipalities in the register, ${n(tiny.under25)} have fewer than 25 addresses, ${n(tiny.under10)} have fewer than 10 and ${n(tiny.exactlyOne)} have exactly one.`}
        </p>
        <p>
          {`${mostlyReservesAndRms ? "Most of the small ones are" : "The small ones include"} First Nations reserves (${n(tiny.under25Reserves)} of the ${n(tiny.under25)}) or Saskatchewan rural municipalities (${n(tiny.under25RuralMunicipalities)}). Saskatchewan has ${n(skRm.municipalities)} rural municipalities in the register, and the median one has ${n(skRm.median, Number.isInteger(skRm.median) ? 0 : 1)} addresses.`}
        </p>
      </FactCard>

      <FactCard
        fact="one-address-municipalities"
        title={`${n(smallest.count)} municipalities tie for smallest, with one address each`}
        wide
      >
        <p>
          {`There is no single smallest municipality. The tie takes in ${n(reserves)} First Nations reserves, ${n(tiny.skRuralMunicipalities.exactlyOne)} Saskatchewan rural municipalities and ${townsPhrase(towns)}, among others. All ${n(smallest.count)} are listed below with their one address.`}
        </p>
        <p>
          {`One of the towns is Little Bay Islands, whose residents voted in 2019 to resettle (from news reports, not the register). Its one register address is listed as ${lbi.address}. The record has no coordinates, and the only other addresses on its postal code are in ${joinList(
            lbi.otherMunicipalitiesOnPostalCode.map((m) => `${m.name} (${n(m.addresses)})`),
            "; "
          )}. It is shown here as published, not as proof that anyone lives there.`}
        </p>
        {ivujivik ? (
          <p>
            {`Another member, ${place(ivujivik.name, ivujivik.province)}, has the northernmost geocoded address in Quebec: ${ivujivik.address}.`}
          </p>
        ) : null}
        <Table caption={`All ${n(smallest.count)} one-address municipalities, by province`} tall>
          <thead>
            <tr>
              <th scope="col">Municipality</th>
              <th scope="col">Prov.</th>
              <th scope="col">Type</th>
              <th scope="col">Address in the register</th>
            </tr>
          </thead>
          <tbody>
            {smallest.municipalities.map((m) => (
              <tr key={m.csdCode} className={highlighted.has(m.name) ? "highlight" : undefined}>
                <td>{m.name}</td>
                <td>{m.province}</td>
                <td>
                  <TypeCode code={m.csdType} />
                </td>
                <td>{m.address}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {`The mailing town and postal code in each address are Canada Post fields and can name a different place than the municipality. ${n(smallest.missingMailingParts)} of these records lack a mailing town, a postal code or both, so their addresses are shorter.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function AverageSection() {
  const mm = FACTS.meanMedian;
  const bands = FACTS.sizeBands;
  const largest = FACTS.topMunicipalities.top[0];

  return (
    <FactSection id="facts-average" eyebrow="Averages" title="Addresses per municipality">
      <FactCard
        fact="mean-vs-median"
        title={`The mean is ${n(mm.mean, 1)} addresses per municipality and the median is ${n(mm.median)}`}
        wide
      >
        <p>
          {`Spread over ${n(mm.municipalities)} municipalities, the ${n(mm.addresses)} addresses that have a municipality average ${n(mm.mean, 1)} each. The median municipality has only ${n(mm.median)}, so the mean is ${n(mm.meanOverMedian, 1)} times the median. The ${n(bands.atLeast100k.municipalities)} municipalities with 100,000 or more addresses hold ${pct(bands.atLeast100k.pctAddresses)} of the total and pull the average up. ${n(mm.belowMean)} municipalities (${pct(mm.pctBelowMean)}) are below the mean, and ${largest.name} alone has ${n(mm.largestOverMedian)} times the median.`}
        </p>
        <p>
          {`The middle half of municipalities have between ${n(bands.percentiles.p25)} and ${n(bands.percentiles.p75)} addresses (the 25th and 75th percentiles).`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function LargestSection() {
  const top = FACTS.topMunicipalities;
  const city = FACTS.biggestCity;
  const first = top.top[0];
  const [fourth, fifth] = [top.top[3], top.top[4]];
  const agree = city.largestCity.name === first.name;

  return (
    <FactSection id="facts-largest" eyebrow="Largest" title="Municipalities with the most addresses">
      <FactCard fact="top-10-municipalities" title={`${first.name} has the most addresses: ${n(first.addresses)}`} wide>
        <p>
          {`That is ${pct(first.pctOfCanada, 2)} of all ${n(top.totalAddresses)} addresses in the register. The top 5 (${joinList(top.top.slice(0, 5).map((m) => m.name))}) hold ${pct(top.top5Pct, 2)} of them and the top 10 hold ${pct(top.top10Pct, 2)}. ${fourth.name} and ${fifth.name}, 4th and 5th, are only ${n(fourth.addresses - fifth.addresses)} addresses apart.`}
        </p>
        <Table caption="Top 10 municipalities by addresses">
          <thead>
            <tr>
              <NumHead>Rank</NumHead>
              <th scope="col">Municipality</th>
              <th scope="col">Prov.</th>
              <th scope="col">Type</th>
              <NumHead>Addresses</NumHead>
              <NumHead>Share of Canada</NumHead>
              <NumHead>Cumulative</NumHead>
            </tr>
          </thead>
          <tbody>
            {top.top.map((m) => (
              <tr key={m.csdCode}>
                <Num>{m.rank}</Num>
                <td>{m.name}</td>
                <td>{m.province}</td>
                <td>
                  <TypeCode code={m.csdType} />
                </td>
                <Num>{n(m.addresses)}</Num>
                <Num>{pct(m.pctOfCanada, 2)}</Num>
                <Num>{pct(m.cumulativePct, 2)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {`Shares here are of all ${n(top.totalAddresses)} addresses, including the ${n(FACTS.dataset.addressesWithoutMunicipality)} with no municipality. 11th is ${place(top.rank11.name, top.rank11.province)}, with ${n(top.rank11.addresses)}.`}
        </p>
      </FactCard>

      <FactCard fact="biggest-city" title={`${city.largestCity.name} is also the biggest legal city`} wide>
        <p>
          {`Counting only the ${n(city.cityTypeMunicipalities)} municipalities whose census type is a city (C, CY or CV), ${city.largestCity.name} still comes first with ${n(city.largestCity.addresses)} addresses${agree ? ", so the two readings agree" : ""}.`}
        </p>
        <p>
          {`${city.top10AllCityOrVille ? "Every municipality in the top 10 is a city or a Quebec ville (type V). " : ""}The largest that is neither is ${place(city.largestNonCity.name, city.largestNonCity.province)}, a ${csdTypeLabel(city.largestNonCity.csdType)}, in ${ordinal(city.largestNonCity.rank)} place with ${n(city.largestNonCity.addresses)}.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function SizeSection() {
  const bands = FACTS.sizeBands;
  const half = FACTS.halfOfAddresses;
  const buildings = FACTS.mostBuildings;
  const regions = FACTS.torontoVsRegions;
  const nu = FACTS.nunavut;
  const town = FACTS.biggestTown;
  const small = FACTS.smallestCities;
  const hundreds = bands.bands.find((b) => b.band === "100-999");
  const thousands = bands.bands.find((b) => b.band === "1,000-9,999");
  const leader = buildings.top[0];
  const addressLeader = buildings.top.find((b) => b.addressRank === 1);
  const nuLargest = nu.communities[0];
  const nuSmallest = nu.communities[nu.communities.length - 1];
  const [smallestCity, nextCity] = small.cities;
  const smallestVille = small.villes[0];
  const halfLarger = half.smallestLargerThanBottomHalf;
  const middleBandsHoldMost =
    !!hundreds && !!thousands && 2 * (hundreds.municipalities + thousands.municipalities) > bands.municipalities;
  const bandSentence =
    hundreds && thousands
      ? `${n(hundreds.municipalities)} (${pct(hundreds.pctMunicipalities)}) have 100 to 999 addresses and ${n(thousands.municipalities)} (${pct(thousands.pctMunicipalities)}) have 1,000 to 9,999. `
      : "";
  const millionSentence =
    bands.atLeast1m === 1
      ? `${FACTS.topMunicipalities.top[0].name} is the only one past a million.`
      : `${n(bands.atLeast1m)} pass a million.`;

  return (
    <FactSection id="facts-size" eyebrow="Size" title="Spread across municipalities">
      <FactCard
        fact="size-buckets"
        title={
          middleBandsHoldMost
            ? "Most municipalities have a few hundred to a few thousand addresses"
            : "Municipalities by number of addresses"
        }
        wide
      >
        <p>
          {`${bandSentence}Only ${n(bands.atLeast100k.municipalities)} have 100,000 or more, and together they hold ${pct(bands.atLeast100k.pctAddresses)} of the addresses in municipalities. ${millionSentence}`}
        </p>
        <Table caption="Municipalities by number of addresses">
          <thead>
            <tr>
              <th scope="col">Addresses</th>
              <NumHead>Municipalities</NumHead>
              <NumHead>Share</NumHead>
              <NumHead>Addresses held</NumHead>
              <NumHead>Share</NumHead>
            </tr>
          </thead>
          <tbody>
            {bands.bands.map((b) => (
              <tr key={b.band}>
                <td>{b.band}</td>
                <Num>{n(b.municipalities)}</Num>
                <Num>{formatShare(b.pctMunicipalities, b.municipalities, 1)}</Num>
                <Num>{n(b.addresses)}</Num>
                <Num>{formatShare(b.pctAddresses, b.addresses, 2)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
      </FactCard>

      <FactCard fact="half-of-addresses" title={`${n(half.for50pct)} municipalities hold half of all addresses`}>
        <p>
          {`Counting from the largest down, the first ${n(half.for50pct)} of ${n(half.municipalities)} municipalities reach ${pct(half.tippingMunicipality.cumulativePct, 2)} of the addresses in municipalities, and ${place(half.tippingMunicipality.name, half.tippingMunicipality.province)} is the one that tips it past half. It takes ${n(half.for75pct)} to reach three quarters and ${n(half.for90pct)} to reach 90%.`}
        </p>
        <p>
          {`At the other end, the smallest ${n(half.bottomHalf.municipalities)} municipalities together hold ${n(half.bottomHalf.addresses)} addresses (${pct(half.bottomHalf.pct, 2)}), fewer than the single municipality of ${place(halfLarger.name, halfLarger.province)} (${n(halfLarger.addresses)}).`}
        </p>
      </FactCard>

      <FactCard
        fact="montreal-most-buildings"
        title={`${leader.name} has more buildings than ${addressLeader ? addressLeader.name : "anywhere else"}`}
      >
        {addressLeader ? (
          <p>
            {`${addressLeader.name} has the most addresses, but ${leader.name} has the most buildings: ${n(leader.buildings)}, against ${addressLeader.name}'s ${n(addressLeader.buildings)}. ${addressLeader.name} averages ${n(addressLeader.addressesPerBuilding, 2)} addresses per building and ${leader.name} ${n(leader.addressesPerBuilding, 2)}.`}
          </p>
        ) : null}
        <Table caption="Top 5 municipalities by buildings">
          <thead>
            <tr>
              <th scope="col">Municipality</th>
              <NumHead>Buildings</NumHead>
              <NumHead>Addresses</NumHead>
              <NumHead>Per building</NumHead>
            </tr>
          </thead>
          <tbody>
            {buildings.top.map((b) => (
              <tr key={b.name}>
                <td>{place(b.name, b.province)}</td>
                <Num>{n(b.buildings)}</Num>
                <Num>{n(b.addresses)}</Num>
                <Num>{n(b.addressesPerBuilding, 2)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
      </FactCard>

      <FactCard
        fact="toronto-vs-atlantic"
        title={`${regions.municipality.name} has more addresses than the Atlantic provinces and territories combined`}
      >
        <p>
          {`${regions.municipality.name}'s ${n(regions.municipality.addresses)} addresses beat all four Atlantic provinces plus Yukon, the Northwest Territories and Nunavut (${n(regions.atlanticPlusTerritories.addresses)} together), and Manitoba plus Saskatchewan (${n(regions.manitobaPlusSaskatchewan.addresses)}).`}
        </p>
        <p>
          {`Counted by buildings the comparison flips: ${regions.municipality.name}'s ${n(regions.municipality.buildings)} are fewer than either group (${n(regions.atlanticPlusTerritories.buildings)} and ${n(regions.manitobaPlusSaskatchewan.buildings)}). Province totals include addresses without a municipality.`}
        </p>
      </FactCard>

      <FactCard
        fact="nunavut-vs-la-sarre"
        title={`All of Nunavut has fewer addresses than ${place(nu.nextLarger.name, nu.nextLarger.province)}`}
      >
        <p>
          {`Nunavut has ${n(nu.addresses)} addresses in the register, in ${n(nu.communities.length)} communities: ${n(nuLargest.addresses)} in ${nuLargest.name} and as few as ${n(nuSmallest.addresses)} in ${nuSmallest.name}. That is ${n(nu.nextLarger.addresses - nu.addresses)} fewer than the single municipality of ${place(nu.nextLarger.name, nu.nextLarger.province)} (${n(nu.nextLarger.addresses)}), and ${n(nu.municipalitiesBigger)} municipalities are bigger than the whole territory.`}
        </p>
      </FactCard>

      <FactCard fact="oakville-biggest-town" title={`${town.name} is a town with more addresses than most cities`}>
        <p>
          {`${place(town.name, town.province)} has census type T (town), yet its ${n(town.addresses)} addresses rank ${ordinal(town.rank)} in Canada. That is more than ${n(town.cityTypeSmaller)} of the ${n(town.cityTypeMunicipalities)} city-type municipalities, or ${n(town.cityOrVilleSmaller)} of ${n(town.cityOrVilleMunicipalities)} if Quebec villes count as cities. The next largest town is ${place(town.nextTown.name, town.nextTown.province)} (${n(town.nextTown.addresses)}).`}
        </p>
      </FactCard>

      <FactCard fact="smallest-cities" title={`${place(smallestCity.name, smallestCity.province)} is the smallest city`}>
        <p>
          {`Of the ${n(FACTS.biggestCity.cityTypeMunicipalities)} city-type municipalities, ${smallestCity.name} has the fewest addresses: ${n(smallestCity.addresses)}. The next, ${place(nextCity.name, nextCity.province)}, has ${n(nextCity.addresses)}. Among Quebec villes, ${smallestVille.name} has ${n(smallestVille.addresses)}.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function ProvinceSection() {
  const rows = FACTS.provinceExtremes;
  const exceptions = rows.filter((r) => !r.biggest.every((b) => isCityOrVille(b.csdType)));
  const byShare = [...rows].sort((a, b) => b.biggest[0].pctOfProvince - a.biggest[0].pctOfProvince);
  const most = byShare[0];
  const least = byShare[byShare.length - 1];
  const single = rows.filter((r) => r.smallestTied === 1);
  const exceptionText = exceptions.length
    ? ` except ${joinList(
        exceptions.map(
          (r) => `${PROVINCE_NAMES[r.province]}, where ${r.biggest[0].name} is a ${csdTypeLabel(r.biggest[0].csdType)}`
        ),
        "; "
      )}`
    : "";

  return (
    <FactSection id="facts-provinces" eyebrow="Provinces" title="Province by province">
      <FactCard fact="per-province-extremes" title="The largest and smallest municipality in each province and territory" wide>
        <p>
          {`The largest municipality is a city or ville everywhere${exceptionText}. How much it dominates varies: ${most.biggest[0].name} holds ${pct(most.biggest[0].pctOfProvince)} of ${PROVINCE_NAMES[most.province]}'s municipal addresses, while ${least.biggest[0].name} has ${pct(least.biggest[0].pctOfProvince)} of ${PROVINCE_NAMES[least.province]}'s.`}
        </p>
        <p>
          {`Only ${joinList(single.map((r) => PROVINCE_NAMES[r.province]))} have a single smallest municipality. Everywhere else the smallest is a tie.`}
        </p>
        <Table caption="Largest and smallest municipality by province and territory">
          <thead>
            <tr>
              <th scope="col">Prov.</th>
              <NumHead>Municipalities</NumHead>
              <NumHead>Median</NumHead>
              <th scope="col">Largest (addresses, share)</th>
              <th scope="col">Smallest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.province}>
                <td>{r.province}</td>
                <Num>{n(r.municipalities)}</Num>
                <Num>{n(r.median, Number.isInteger(r.median) ? 0 : 1)}</Num>
                <td>{r.biggest.map((b) => `${b.name} (${n(b.addresses)}, ${pct(b.pctOfProvince)})`).join("; ")}</td>
                <td>{describeSmallest(r)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {"Shares divide by the province's addresses that have a municipality. Medians are addresses per municipality."}
        </p>
      </FactCard>
    </FactSection>
  );
}

function NamesSection() {
  const same = FACTS.sameNameSameProvince;
  const shared = FACTS.sharedNames;
  const lengths = FACTS.nameLengths;
  const saints = FACTS.quebecSaints;
  const [leader, ...rest] = shared.names;
  const runnersUp = rest.filter((r) => r.provinces === rest[0]?.provinces);
  const longest = lengths.longest[0];
  const street = lengths.longestStreet[0];
  const quebecPairs = same.byProvince.find((p) => p.province === "QC");
  const oneExclaimed = saints.exclamationMunicipalities.length === 1;

  return (
    <FactSection id="facts-names" eyebrow="Names" title="Municipality and street names">
      <FactCard
        fact="same-name-same-province"
        title={`${n(same.names)} names are shared by municipalities in the same province`}
      >
        <p>
          {`No name is used by more than ${n(same.maxPerName)} municipalities in one province${quebecPairs ? `, and Quebec has ${n(quebecPairs.names)} of the pairs` : ""}. The pairs with the largest members:`}
        </p>
        <ul className="factList">
          {same.largest.map((pair) => (
            <li key={`${pair.name}-${pair.province}`}>
              {`${place(pair.name, pair.province)}: ${joinList(
                pair.municipalities.map((m) => `a ${csdTypeWord(m.csdType)} (${n(m.addresses)})`)
              )}`}
            </li>
          ))}
        </ul>
        <p className="factNote">This is why the page counts municipalities by census code rather than by name.</p>
      </FactCard>

      <FactCard fact="shared-names-across-provinces" title={`${leader.name} is the municipality name found in the most provinces`}>
        <p>
          {`${n(leader.municipalities)} municipalities in ${n(leader.provinces)} provinces are named ${leader.name}: ${joinList(
            leader.places.map((p) => `${p.province} (${csdTypeWord(p.csdType)}, ${n(p.addresses)})`)
          )}.${
            runnersUp.length
              ? ` ${joinList(runnersUp.map((r) => r.name))} each appear in ${n(runnersUp[0].provinces)}.`
              : ""
          }`}
        </p>
        {shared.spellingVariants.map((v) => (
          <p key={v.spellings.join("|")}>
            {`Counting ${joinList(v.spellings)} as one name puts it in ${n(v.provinces)} provinces${
              v.provinces === leader.provinces ? " too" : ""
            }.`}
          </p>
        ))}
        <p>
          {`The retriever's default city, Burlington, exists in ${joinList(
            shared.burlington.map((b) => `${PROVINCE_NAMES[b.province]} (${n(b.addresses)})`)
          )}.`}
        </p>
      </FactCard>

      <FactCard fact="longest-shortest-names" title={`The longest municipality name has ${n(longest.length)} characters`}>
        <p>
          {`It is "${longest.name}" in ${PROVINCE_NAMES[longest.province]} (${n(longest.addresses)} addresses). The shortest names have ${n(lengths.shortest[0].length)} letters, a ${n(lengths.shortest.length)}-way tie: ${joinList(
            lengths.shortest.map((s) => place(s.name, s.province)),
            "; "
          )}.`}
        </p>
        <p>
          {`The longest street name, at ${n(street.length)} characters, has ${street.addresses === 1 ? "one address" : `${n(street.addresses)} addresses, including`}: ${street.example}.`}
        </p>
      </FactCard>

      <FactCard fact="quebec-saints-and-ha-ha" title={`${pct(saints.pct)} of Quebec municipality names start with Saint- or Sainte-`}>
        <p>
          {`That is ${n(saints.saint + saints.sainte)} of ${n(saints.quebecMunicipalities)}: ${n(saints.saint)} Saint- and ${n(saints.sainte)} Sainte-.`}
        </p>
        <p>
          {`${oneExclaimed ? "Only one municipality name in Canada has" : "These municipality names have"} exclamation marks: ${joinList(
            saints.exclamationMunicipalities.map((m) => `${place(m.name, m.province)} (${n(m.addresses)} addresses)`)
          )}. ${saints.exclamationStreets.length === 1 ? "One street shares them" : "Streets that share them"}: ${joinList(
            saints.exclamationStreets.map((s) => `${s.street} in ${s.municipality} (${countOf(s.addresses, "address", "addresses")})`)
          )}.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function StreetsSection() {
  const main = FACTS.mainStreet;
  const prin = FACTS.principale;
  const repeated = FACTS.repeatedAddresses;
  const busiest = FACTS.busiestStreets;
  const fun = FACTS.funStreets;
  const islands = FACTS.islands;
  const dirs = FACTS.directions;
  const top = main.byAddresses[0];
  const [fullFirst, fullSecond, fullThird] = main.fullNameByMunicipalities;
  const sixth = main.byMunicipalities[5];
  const [pFirst, pSecond] = prin.byBuildings;
  const [pHome, ...pOthers] = prin.buildingsByProvince;
  const [rueFull, mainFull] = prin.fullNames;
  // Provinces, largest first, that it takes on top of the home province to pass the runner-up.
  const needed: typeof pOthers = [];
  let running = pHome.buildings;
  for (const p of pOthers) {
    if (running > pSecond.buildings) break;
    needed.push(p);
    running += p.buildings;
  }
  const extra = pOthers.slice(needed.length);
  const [rFirst, rSecond, rThird, ...rTied] = repeated.top;
  const tiedText =
    rTied.length > 1
      ? `${joinList(rTied.map((r) => r.address))}, tied at ${n(rTied[0].municipalities)}`
      : rTied.map((r) => `${r.address} (${n(r.municipalities)})`).join("");
  const [streetTop] = busiest.byAddresses;
  const [buildingTop] = busiest.byBuildings;
  const unique = fun.filter((s) => s.nameMunicipalitiesAnyType === 1);
  const [dirFirst, dirSecond] = dirs.topByMunicipality;
  const islandLeader = islands.topMunicipalities[0];

  return (
    <FactSection id="facts-streets" eyebrow="Streets" title="Street names">
      <FactCard fact="most-common-street-name-main" title={`${top.name} is the most common street name`} wide>
        <p>
          {`Streets named ${top.name} have ${n(top.addresses)} addresses in ${n(top.buildings)} buildings and appear in ${n(top.municipalities)} of the ${n(FACTS.dataset.municipalities)} municipalities. As a full street name, ${fullFirst.name} ${fullFirst.type} is in ${n(fullFirst.municipalities)}, well ahead of ${fullSecond.name} ${fullSecond.type} (${n(fullSecond.municipalities)}) and ${fullThird.name} ${fullThird.type} (${n(fullThird.municipalities)}).`}
        </p>
        <p>
          {`${top.name} is in ${n(top.provinces)} of the 13 provinces and territories; ${joinList(main.provincesWithout)} have none.`}
        </p>
        <Table caption="Street names found in the most municipalities">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <NumHead>Municipalities</NumHead>
            </tr>
          </thead>
          <tbody>
            {main.byMunicipalities.slice(0, 5).map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <Num>{n(s.municipalities)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
        {sixth ? <p className="factNote">{`6th is ${sixth.name}, in ${n(sixth.municipalities)}.`}</p> : null}
      </FactCard>

      <FactCard fact="principale-has-more-buildings-than-main" title={`By buildings, ${pFirst.name} beats ${pSecond.name}`}>
        <p>
          {`Streets named ${pFirst.name} have ${n(pFirst.buildings)} buildings to ${pSecond.name}'s ${n(pSecond.buildings)}. ${pSecond.name} still has more addresses (${n(pSecond.addresses)} to ${n(pFirst.addresses)}) because its buildings hold more units: ${n(pSecond.addressesPerBuilding, 2)} addresses per building against ${n(pFirst.addressesPerBuilding, 2)}.`}
        </p>
        <p>
          {`${PROVINCE_NAMES[pHome.province]} has most of the ${pFirst.name} buildings (${n(pHome.buildings)}), ${
            needed.length
              ? `but on its own it would fall short of ${pSecond.name}. Adding ${joinList(
                  needed.map((p) => `${PROVINCE_NAMES[p.province]} (${n(p.buildings)})`)
                )} puts it ahead${
                  extra.length
                    ? `, and ${joinList(extra.map((p) => `${PROVINCE_NAMES[p.province]} (${n(p.buildings)})`))} add the rest`
                    : ""
                }.`
              : `enough on its own to pass ${pSecond.name}.`
          } Full names give the same order: ${rueFull.name} ${rueFull.type} has ${n(rueFull.buildings)} buildings and ${mainFull.name} ${mainFull.type} has ${n(mainFull.buildings)}.`}
        </p>
      </FactCard>

      <FactCard fact="most-repeated-street-address" title={`${rFirst.address} exists in ${n(rFirst.municipalities)} municipalities`}>
        <p>
          {`That is more than any other exact street address. Next come ${rSecond.address} (${n(rSecond.municipalities)}) and ${rThird.address} (${n(rThird.municipalities)}), then ${tiedText}.`}
        </p>
        <p>
          {`A direction counts as part of the address here, so ${rFirst.address} N is a different address. Ignoring directions, ${joinList(repeated.ignoringDirection.map((r) => r.address))} leads with ${n(repeated.ignoringDirection[0].municipalities)}.`}
        </p>
      </FactCard>

      <FactCard
        fact="busiest-single-street"
        title={`${streetTop.street} in ${streetTop.municipality} has the most addresses of any street`}
        wide
      >
        <p>
          {`It has ${n(streetTop.addresses)} addresses in ${n(streetTop.buildings)} buildings. The street with the most buildings is ${buildingTop.street} in ${buildingTop.municipality}: ${n(buildingTop.buildings)} buildings and ${n(buildingTop.addresses)} addresses.`}
        </p>
        <Table caption="Streets with the most addresses">
          <thead>
            <tr>
              <th scope="col">Street</th>
              <NumHead>Addresses</NumHead>
              <NumHead>Buildings</NumHead>
            </tr>
          </thead>
          <tbody>
            {busiest.byAddresses.map((s) => (
              <tr key={`${s.street}-${s.municipality}`}>
                <td>{`${s.street}, ${s.municipality}`}</td>
                <Num>{n(s.addresses)}</Num>
                <Num>{n(s.buildings)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {`A street here is one name, type and direction within one municipality. The register has ${n(busiest.streets)} of them.`}
        </p>
      </FactCard>

      <FactCard fact="fun-street-names" title="Memory Lane, Easy Street and Sesame Street all exist" wide>
        <Table caption="A few street names, by municipalities and addresses">
          <thead>
            <tr>
              <th scope="col">Street</th>
              <NumHead>Municipalities</NumHead>
              <NumHead>Addresses</NumHead>
              <th scope="col">Where</th>
            </tr>
          </thead>
          <tbody>
            {fun.map((s) => (
              <tr key={s.street}>
                <td>{s.street}</td>
                <Num>{n(s.municipalities)}</Num>
                <Num>{n(s.addresses)}</Num>
                <td>{s.where ? joinList(s.where.map((w) => place(w.municipality, w.province)), "; ") : ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {`Counts are for that exact name and street type, in addresses that have a municipality. ${joinList(unique.map((s) => s.name))} appear in only one municipality under any street type.`}
        </p>
      </FactCard>

      <FactCard fact="island-addresses" title={`${n(islands.total)} addresses have an island for a street`}>
        <p>
          {`Their street type is ISLAND (${n(islands.island)}) or, in Quebec, ÎLE (${n(islands.ile)}). Ontario has ${n(islands.islandOntario)} of the ISLAND addresses. ${place(islandLeader.municipality, islandLeader.province)} leads with ${n(islandLeader.addresses)}, where islands carry codes such as ${islands.example}, followed by ${joinList(
            islands.topMunicipalities.slice(1).map((m) => `${place(m.municipality, m.province)} (${n(m.addresses)})`),
            "; "
          )}.`}
        </p>
      </FactCard>

      <FactCard fact="most-common-street-direction" title={`${dirs.top.dir} is the most common street direction`}>
        <p>
          {`${pct(dirs.nonePct, 2)} of addresses have no direction. Among those that do, ${dirs.top.dir} leads with ${n(dirs.top.addresses)}; ${pct(dirFirst.pctOfDirection)} of them are in ${dirFirst.municipality} and ${pct(dirSecond.pctOfDirection)} in ${dirSecond.municipality}. Next are ${joinList(
            dirs.next.map((d) => `${d.dir} (${n(d.addresses)})`)
          )}.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function NumbersSection() {
  const common = FACTS.commonCivic;
  const high = FACTS.highestCivic;
  const suf = FACTS.civicSuffixes;
  const [c1, c2, c3] = common.top;
  const letters = suf.letterKinds === 26 ? "every letter from A to Z" : `${n(suf.letterKinds)} letters`;

  return (
    <FactSection id="facts-numbers" eyebrow="Civic numbers" title="House numbers">
      <FactCard fact="most-common-civic-number" title={`${c1.civic} is the most common civic number`}>
        <p>
          {`${n(c1.addresses)} addresses are number ${c1.civic}, then ${c2.civic} (${n(c2.addresses)}) and ${c3.civic} (${n(c3.addresses)}). Number 1 ranks only ${ordinal(common.one.rank)}, with ${n(common.one.addresses)}.`}
        </p>
      </FactCard>

      <FactCard fact="highest-civic-number" title={`The highest civic number is ${high.civic}`}>
        <p>
          {`It is ${high.address}, in ${place(high.municipality, high.province)}. All ${n(high.sameStreetInMunicipality.addresses)} addresses on ${high.street} in ${high.municipality} are numbered between ${n(high.sameStreetInMunicipality.min)} and ${n(high.sameStreetInMunicipality.max)}. Nationally, ${n(high.sixDigit)} addresses have six-digit civic numbers${high.sevenPlusDigit === 0 ? " and none has seven" : ""}.`}
        </p>
      </FactCard>

      <FactCard
        fact="civic-suffixes-fractions-zero"
        wide
        title={`${n(suf.threeQuarters)} addresses have a three-quarter civic number`}
      >
        <p>
          {`${n(suf.withSuffix)} addresses have a civic suffix, of ${n(suf.kinds)} kinds: ${letters} (${suf.mostCommon.suffix} is the most common, with ${n(suf.mostCommon.addresses)}) and ${n(suf.fractionKinds)} fractions. ${n(suf.half)} are a 1/2, ${n(suf.quarter)} a 1/4 and ${n(suf.threeQuarters)} a 3/4, ${n(suf.threeQuartersTopMunicipality.addresses)} of them in ${suf.threeQuartersTopMunicipality.municipality}. Another ${n(suf.civicZero)} addresses have civic number 0.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function BuildingsSection() {
  const big = FACTS.biggestBuildings;
  const base = FACTS.basements;
  const house = FACTS.houseDescriptions;
  const [first, second] = big.top;
  const labelsAhead = base.topLabels.slice(0, base.bsmtRank - 1).map((l) => l.label);
  const [b1, ...bRest] = base.topMunicipalities;
  const longest = house.longest[0];
  const allLabelled = first.distinctUnitLabels === first.addresses;

  return (
    <FactSection id="facts-buildings" eyebrow="Buildings" title="Buildings and units">
      <FactCard
        fact="biggest-building"
        title={`${first.address} in ${first.municipality} has ${n(first.addresses)} addresses`}
        wide
      >
        <p>
          {`No building in the register has more${allLabelled ? ", and each of its addresses has its own unit label" : ""}. Next is ${second.address} in ${second.municipality} (${n(second.addresses)}).`}
        </p>
        <Table caption="Buildings with the most addresses">
          <thead>
            <tr>
              <th scope="col">Building</th>
              <NumHead>Addresses</NumHead>
            </tr>
          </thead>
          <tbody>
            {big.top.map((b) => (
              <tr key={`${b.address}-${b.municipality}`}>
                <td>{`${b.address}, ${b.municipality}`}</td>
                <Num>{n(b.addresses)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
      </FactCard>

      <FactCard fact="single-address-buildings" title={`${pct(big.pctSingleAddress, 1)} of buildings have exactly one address`}>
        <p>
          {`${n(big.singleAddressBuildings)} of ${n(big.buildings)} buildings have a single address, and the average is ${n(big.addressesPerBuilding, 2)} addresses per building. A building here is one register location, and an address is one unit in it.`}
        </p>
      </FactCard>

      <FactCard fact="basement-units" title={`BSMT is the ${ordinal(base.bsmtRank)} most common unit label`}>
        <p>
          {`${n(base.exactBsmt)} addresses have the unit label BSMT, behind only ${joinList(labelsAhead)}. Counting every label that starts with BSMT or BASEMENT gives ${n(base.anyBasementLabel)}. ${place(b1.municipality, b1.province)} has the most (${n(b1.basement)}, ${pct(b1.pct, 2)} of its addresses), ahead of ${joinList(
            bRest.map((m) => `${m.municipality} (${n(m.basement)})`)
          )}.`}
        </p>
      </FactCard>

      <FactCard fact="house-description-labels" title="Some unit labels describe the house" wide>
        <p>
          {`The longest unit label in the register, at ${n(longest.length)} characters, belongs to ${longest.address} in ${place(longest.municipality, longest.province)}:`}
        </p>
        <blockquote className="factQuote">{longest.label}</blockquote>
        <p>
          {`Unit labels that mention trim, floors or windows: ${joinList(
            house.descriptiveByProvince.map((p) => `${n(p.labels)} in ${PROVINCE_NAMES[p.province]}`)
          )}.`}
        </p>
      </FactCard>
    </FactSection>
  );
}

function coordinate(value: number, positive: string, negative: string, digits: number) {
  return `${n(Math.abs(value), digits)}°${value >= 0 ? positive : negative}`;
}

function GeographySection() {
  const ex = FACTS.extremes;
  const lat = FACTS.latitude;
  const lone = FACTS.loneliest;
  const fsas = FACTS.singleAddressFsas;
  const north = ex.points[0];
  const [first, second, third] = lone.top;
  const northBare =
    north.address === null && ex.northMunicipality.withCivicNumber === 0 && ex.northMunicipality.withStreet === 0;
  const firstIntro =
    first.municipalityAddresses === 1
      ? `The only address in ${place(first.municipality, first.province)}, ${first.address},`
      : `${first.address} in ${place(first.municipality, first.province)}`;

  return (
    <FactSection id="facts-geography" eyebrow="Geography" title="Location and distance">
      <FactCard
        fact="geographic-extremes"
        title={`The northernmost address is in ${place(north.municipality, north.province)}`}
        wide
      >
        <p>
          {`It sits at ${coordinate(north.lat, "N", "S", 6)}${
            northBare
              ? ` but has no civic number or street, only the postal code ${north.postalCode}. None of ${north.municipality}'s ${countOf(ex.northMunicipality.addresses, "address", "addresses")} has either.`
              : "."
          } The northernmost address with a street is ${ex.northWithStreet.address} in ${place(ex.northWithStreet.municipality, ex.northWithStreet.province)}, at ${coordinate(ex.northWithStreet.lat, "N", "S", 6)}.`}
        </p>
        <Table caption="The farthest addresses in each direction">
          <thead>
            <tr>
              <th scope="col">Extreme</th>
              <th scope="col">Address</th>
              <th scope="col">Municipality</th>
              <NumHead>Latitude</NumHead>
              <NumHead>Longitude</NumHead>
            </tr>
          </thead>
          <tbody>
            {ex.points.map((p) => (
              <tr key={p.direction}>
                <td>{p.direction[0].toUpperCase() + p.direction.slice(1)}</td>
                <td>{p.address ?? `No street (postal code ${p.postalCode})`}</td>
                <td>{place(p.municipality, p.province)}</td>
                <Num>{coordinate(p.lat, "N", "S", 6)}</Num>
                <Num>{coordinate(p.lon, "E", "W", 6)}</Num>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="factNote">
          {`Coordinates are the register's representative point for each building, which can be a driveway or road access point. ${n(ex.geocodedAddresses)} of ${n(FACTS.dataset.addresses)} addresses have them.`}
        </p>
      </FactCard>

      <FactCard fact="loneliest-building" title={`The loneliest building is ${n(first.km, 1)} km from its nearest neighbour`}>
        <p>
          {`${firstIntro} is ${n(first.km, 1)} km from the nearest other geocoded building in the register, ${first.nearest.address} in ${place(first.nearest.municipality, first.nearest.province)}. Next is ${second.address} in ${place(second.municipality, second.province)}, ${n(second.km, 1)} km from ${second.nearest.municipality}.`}
        </p>
        {third ? (
          <p className="factNote">
            {`These distances measure the register's coverage as much as geography. Third place, ${place(third.municipality, third.province)}, has ${countOf(third.municipalityGeocoded, "geocoded address", "geocoded addresses")} out of ${n(third.municipalityAddresses)}, so it is left out.`}
          </p>
        ) : null}
      </FactCard>

      <FactCard fact="latitude-bands" title={`${pct(lat.pctSouthOf49, 0)} of addresses lie south of the 49th parallel`}>
        <p>
          {`${pct(lat.pctSouthOf49, 2)} of geocoded addresses (${n(lat.southOf49)} of ${n(lat.geocodedAddresses)}) are south of 49°N. Only ${n(lat.northOf60)} (${pct(lat.pctNorthOf60, 3)}) are at or north of 60°N. The median address latitude is ${coordinate(lat.medianLat, "N", "S", 4)}.`}
        </p>
      </FactCard>

      <FactCard fact="single-address-fsas" title={`${n(fsas.list.length)} postal areas have exactly one address`} wide>
        <p>
          {`A forward sortation area is the first three characters of a postal code. Of the ${n(fsas.fsas)} in the register, these contain one address each:`}
        </p>
        <Table caption="Forward sortation areas with one address">
          <thead>
            <tr>
              <th scope="col">Area</th>
              <th scope="col">Address</th>
            </tr>
          </thead>
          <tbody>
            {fsas.list.map((f) => (
              <tr key={f.fsa}>
                <td>{f.fsa}</td>
                <td>{f.address}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </FactCard>
    </FactSection>
  );
}

function MethodSection() {
  const d = FACTS.dataset;
  const tiny = FACTS.tinyMunicipalities;

  return (
    <section className="factSection factMethod" id="facts-method" aria-labelledby="facts-method-title">
      <div className="factSectionHead">
        <p className="eyebrow">Method</p>
        <h3 id="facts-method-title">Counting method</h3>
      </div>
      <div className="legalBody">
        <p>
          {`All figures come from the full register, ${d.release} release: ${n(d.addresses)} addresses in ${n(d.buildings)} buildings. A building is one register location (LOC_GUID) and an address is one unit in it (ADDR_GUID).`}
        </p>
        <p>
          {`A municipality is a census subdivision, identified by the census subdivision code that the register's location files give for each building. That yields ${n(d.municipalities)} municipalities holding ${n(d.addressesWithMunicipality)} addresses. The other ${n(d.addressesWithoutMunicipality)} addresses have no municipality and are left out of municipality counts, though national and province totals include them. Grouping by name and province instead would merge same-name pairs and give ${n(tiny.byNameAndProvince.municipalities)} municipalities, ${n(tiny.byNameAndProvince.under25)} under 25 addresses and ${n(tiny.byNameAndProvince.exactlyOne)} with one.`}
        </p>
        <p>
          {`The retriever's city list groups by name and Canada Post mailing province, which is missing on some addresses. It has ${n(tiny.retrieverCityList.entries)} entries, including ${n(tiny.retrieverCityList.entriesWithoutMailProvince)} with no mailing province, so it shows more small places (${n(tiny.retrieverCityList.under25)} under 25 addresses) than there are small municipalities. Mailing towns and postal codes appear on this page only as part of an address.`}
        </p>
        <p>
          {`When several places tie at a cut-off, all of them are listed. Type names such as "Indian reserve" for IRI are Statistics Canada's census subdivision types, and the register stores only the code. Details from outside the register are marked where they appear.`}
        </p>
        <p>
          The numbers are generated by <code>scripts/facts-build.sh</code>, which runs{" "}
          <code>sql/facts.sql</code> against the full local import and writes{" "}
          <code>apps/web/src/facts.generated.json</code>.
        </p>
      </div>
    </section>
  );
}

export function FactsView() {
  const d = FACTS.dataset;
  const tiny = FACTS.tinyMunicipalities;
  const mm = FACTS.meanMedian;
  const top = FACTS.topMunicipalities.top[0];

  return (
    <section className="page factsPage" aria-label="Facts">
      <div className="pageIntro">
        <p className="eyebrow">Facts</p>
        <h2>Facts from the National Address Register</h2>
        <p>
          {`Counts of municipalities, streets and buildings from Statistics Canada's National Address Register, ${d.release} release: ${n(d.addresses)} addresses in ${n(d.municipalities)} municipalities.`}
        </p>
      </div>

      <div className="calloutCard">
        <Database aria-hidden="true" size={24} />
        <div>
          <h3>Counted from the full register</h3>
          <p>
            {`Every figure here comes from all ${n(d.addresses)} addresses. The live retriever on this site picks from a smaller sample of the register, so it holds fewer addresses per city than the counts here. ${n(d.addressesWithoutMunicipality)} addresses with no municipality are left out of the municipality counts.`}
          </p>
        </div>
      </div>

      <dl className="factStats" aria-label="Key numbers">
        <div>
          <dt>Municipalities</dt>
          <dd>{n(d.municipalities)}</dd>
        </div>
        <div>
          <dt>Mean addresses each</dt>
          <dd>{n(mm.mean, 1)}</dd>
        </div>
        <div>
          <dt>Median addresses each</dt>
          <dd>{n(mm.median)}</dd>
        </div>
        <div>
          <dt>Under 25 addresses</dt>
          <dd>{n(tiny.under25)}</dd>
        </div>
        <div>
          <dt>Exactly one address</dt>
          <dd>{n(tiny.exactlyOne)}</dd>
        </div>
        <div>
          <dt>Most addresses</dt>
          <dd>{`${top.name} (${n(top.addresses)})`}</dd>
        </div>
      </dl>

      <nav className="factToc" aria-label="Facts sections">
        {FACT_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
      </nav>

      <SmallestSection />
      <AverageSection />
      <LargestSection />
      <SizeSection />
      <ProvinceSection />
      <NamesSection />
      <StreetsSection />
      <NumbersSection />
      <BuildingsSection />
      <GeographySection />
      <MethodSection />
    </section>
  );
}
