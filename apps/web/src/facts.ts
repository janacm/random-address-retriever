import generated from "./facts.generated.json";

// Shape of facts.generated.json, written by scripts/facts-build.sh from the
// full NAR import (sql/facts.sql). Assigning the JSON import to this type below
// makes `tsc` fail if the generator and the page drift apart.

type Place = { name: string; province: string; csdType: string; addresses: number };
type RankedPlace = Place & { rank: number };
type MunicipalityRef = { municipality: string; province: string };
type MunicipalityCount = MunicipalityRef & { addresses: number };

export type FactsData = {
  dataset: {
    source: string;
    release: string;
    addresses: number;
    addressesWithMunicipality: number;
    addressesWithoutMunicipality: number;
    municipalities: number;
    buildings: number;
    geocodedBuildings: number;
    generatedBy: string;
  };
  tinyMunicipalities: {
    municipalities: number;
    under25: number;
    under10: number;
    exactlyOne: number;
    under25Reserves: number;
    under25RuralMunicipalities: number;
    under25RuralMunicipalitiesOutsideSk: number;
    skRuralMunicipalities: {
      municipalities: number;
      under25: number;
      exactlyOne: number;
      median: number;
    };
    byNameAndProvince: {
      municipalities: number;
      under25: number;
      under10: number;
      exactlyOne: number;
    };
    retrieverCityList: {
      entries: number;
      entriesWithoutMailProvince: number;
      under25: number;
      exactlyOne: number;
    };
  };
  smallestMunicipalities: {
    addressesEach: number;
    count: number;
    byType: Array<{ csdType: string; municipalities: number }>;
    byProvince: Array<{ province: string; municipalities: number }>;
    missingMailingParts: number;
    municipalities: Array<{
      csdCode: string;
      name: string;
      province: string;
      csdType: string;
      address: string;
    }>;
  };
  littleBayIslands: {
    address: string;
    hasCoordinates: boolean;
    mailTown: string;
    postalCode: string;
    otherMunicipalitiesOnPostalCode: Array<{ name: string; addresses: number }>;
  };
  meanMedian: {
    municipalities: number;
    addresses: number;
    mean: number;
    median: number;
    meanOverMedian: number;
    belowMean: number;
    pctBelowMean: number;
    largestOverMedian: number;
  };
  sizeBands: {
    municipalities: number;
    bands: Array<{
      band: string;
      municipalities: number;
      pctMunicipalities: number;
      addresses: number;
      pctAddresses: number;
    }>;
    atLeast100k: { municipalities: number; addresses: number; pctAddresses: number };
    atLeast1m: number;
    percentiles: { p25: number; p50: number; p75: number };
  };
  halfOfAddresses: {
    municipalities: number;
    for50pct: number;
    for75pct: number;
    for90pct: number;
    tippingMunicipality: {
      name: string;
      province: string;
      addresses: number;
      cumulativePct: number;
    };
    bottomHalf: {
      municipalities: number;
      addresses: number;
      pct: number;
      largestIncluded: number;
      smallestExcluded: number;
    };
    smallestLargerThanBottomHalf: {
      name: string;
      province: string;
      addresses: number;
      rank: number;
    };
  };
  topMunicipalities: {
    totalAddresses: number;
    top: Array<
      RankedPlace & {
        csdCode: string;
        buildings: number;
        pctOfCanada: number;
        cumulativePct: number;
      }
    >;
    top5Addresses: number;
    top5Pct: number;
    top10Addresses: number;
    top10Pct: number;
    rank11: Place;
    tiesInTop11: number;
  };
  biggestCity: {
    cityTypes: string[];
    cityTypeMunicipalities: number;
    villes: number;
    largestCity: RankedPlace;
    top10AllCityOrVille: boolean;
    largestNonCity: RankedPlace;
  };
  mostBuildings: {
    top: Array<{
      rank: number;
      name: string;
      province: string;
      buildings: number;
      addresses: number;
      addressesPerBuilding: number;
      addressRank: number;
    }>;
    sixthBuildings: number;
  };
  torontoVsRegions: {
    municipality: { name: string; province: string; addresses: number; buildings: number };
    atlanticPlusTerritories: { addresses: number; buildings: number };
    manitobaPlusSaskatchewan: { addresses: number; buildings: number };
  };
  nunavut: {
    addresses: number;
    municipalAddresses: number;
    communities: Array<{ name: string; addresses: number }>;
    municipalitiesBigger: number;
    municipalitiesEqual: number;
    nextLarger: Place;
  };
  biggestTown: RankedPlace & {
    sameCount: number;
    cityTypeMunicipalities: number;
    cityTypeSmaller: number;
    cityOrVilleMunicipalities: number;
    cityOrVilleSmaller: number;
    nextTown: { name: string; province: string; addresses: number };
  };
  smallestCities: { cities: Place[]; villes: Place[] };
  provinceExtremes: Array<{
    province: string;
    municipalities: number;
    addresses: number;
    mean: number;
    median: number;
    biggest: Array<{ name: string; csdType: string; addresses: number; pctOfProvince: number }>;
    smallestAddresses: number;
    smallestTied: number;
    smallest: Array<{ name: string; csdType: string }> | null;
  }>;
  sameNameSameProvince: {
    names: number;
    sameType: number;
    maxPerName: number;
    byProvince: Array<{ province: string; names: number }>;
    largest: Array<{
      name: string;
      province: string;
      municipalities: Array<{ csdType: string; addresses: number }>;
    }>;
  };
  sharedNames: {
    names: Array<{
      name: string;
      provinces: number;
      municipalities: number;
      places: Array<{ province: string; csdType: string; addresses: number }>;
    }>;
    spellingVariants: Array<{ spellings: string[]; provinces: number; municipalities: number }>;
    burlington: Array<{ province: string; csdType: string; addresses: number }>;
  };
  nameLengths: {
    longest: Array<Place & { length: number }>;
    shortest: Array<Place & { length: number }>;
    longestStreet: Array<
      MunicipalityRef & { street: string; length: number; addresses: number; example: string }
    >;
  };
  quebecSaints: {
    quebecMunicipalities: number;
    saint: number;
    sainte: number;
    pct: number;
    exclamationMunicipalities: Array<{ name: string; province: string; addresses: number }>;
    exclamationStreets: Array<MunicipalityCount & { street: string }>;
  };
  mainStreet: {
    byAddresses: Array<{
      name: string;
      addresses: number;
      buildings: number;
      municipalities: number;
      provinces: number;
    }>;
    byMunicipalities: Array<{ name: string; municipalities: number }>;
    fullNameByMunicipalities: Array<{
      name: string;
      type: string;
      municipalities: number;
      provinces: number;
      addresses: number;
    }>;
    provincesWithout: string[];
  };
  principale: {
    byBuildings: Array<{
      name: string;
      buildings: number;
      addresses: number;
      addressesPerBuilding: number;
    }>;
    buildingsByProvince: Array<{ province: string; buildings: number }>;
    fullNames: Array<{ name: string; type: string; buildings: number; addresses: number }>;
  };
  busiestStreets: {
    streets: number;
    byAddresses: Array<MunicipalityCount & { street: string; buildings: number }>;
    fourthAddresses: number;
    byBuildings: Array<MunicipalityCount & { street: string; buildings: number }>;
    fourthBuildings: number;
  };
  repeatedAddresses: {
    top: Array<{ address: string; municipalities: number }>;
    ignoringDirection: Array<{ address: string; municipalities: number }>;
  };
  funStreets: Array<{
    name: string;
    street: string;
    municipalities: number;
    addresses: number;
    addressesInclNoMunicipality: number;
    nameMunicipalitiesAnyType: number;
    where: MunicipalityRef[] | null;
  }>;
  islands: {
    total: number;
    island: number;
    ile: number;
    ileQuebec: number;
    islandOntario: number;
    topMunicipalities: MunicipalityCount[];
    ileTopMunicipalities: MunicipalityCount[];
    example: string;
  };
  directions: {
    none: number;
    nonePct: number;
    top: { dir: string; addresses: number; pct: number };
    next: Array<{ dir: string; addresses: number }>;
    topByMunicipality: Array<MunicipalityCount & { pctOfDirection: number }>;
    withoutMunicipality: number;
  };
  commonCivic: {
    top: Array<{ civic: string; addresses: number; rank: number }>;
    one: { addresses: number; rank: number };
  };
  highestCivic: {
    civic: number;
    street: string;
    address: string;
    municipality: string;
    province: string;
    tiedAtMax: number;
    sameStreetInMunicipality: { addresses: number; min: number; max: number };
    sixDigit: number;
    sevenPlusDigit: number;
  };
  civicSuffixes: {
    withSuffix: number;
    kinds: number;
    letterKinds: number;
    fractionKinds: number;
    mostCommon: { suffix: string; addresses: number };
    a: number;
    half: number;
    quarter: number;
    threeQuarters: number;
    threeQuartersTopMunicipality: MunicipalityCount;
    civicZero: number;
  };
  biggestBuildings: {
    top: Array<
      MunicipalityRef & {
        rank: number;
        addresses: number;
        address: string;
        postalCodes: string[];
        distinctUnitLabels: number;
        residential: number;
        partialResidential: number;
      }
    >;
    sixthAddresses: number;
    buildings: number;
    singleAddressBuildings: number;
    pctSingleAddress: number;
    addressesPerBuilding: number;
  };
  basements: {
    exactBsmt: number;
    bsmtRank: number;
    topLabels: Array<{ label: string; addresses: number }>;
    anyBasementLabel: number;
    topMunicipalities: Array<MunicipalityRef & { basement: number; addresses: number; pct: number }>;
  };
  houseDescriptions: {
    longest: Array<MunicipalityRef & { label: string; length: number; address: string }>;
    descriptiveByProvince: Array<{ province: string; labels: number }>;
  };
  extremes: {
    geocodedAddresses: number;
    points: Array<
      MunicipalityRef & {
        direction: string;
        lat: number;
        lon: number;
        addressesAtPoint: number;
        address: string | null;
        postalCode: string | null;
      }
    >;
    northWithStreet: MunicipalityRef & { lat: number; lon: number; address: string };
    northMunicipality: {
      name: string;
      addresses: number;
      withCivicNumber: number;
      withStreet: number;
    };
    northernmostInQuebec: { municipality: string; lat: number };
  };
  latitude: {
    geocodedAddresses: number;
    southOf49: number;
    pctSouthOf49: number;
    northOf60: number;
    pctNorthOf60: number;
    medianLat: number;
  };
  loneliest: {
    geocodedBuildings: number;
    candidates: number;
    unresolvedCandidates: number;
    widestCellKm: number;
    top: Array<
      MunicipalityRef & {
        rank: number;
        km: number;
        address: string;
        municipalityAddresses: number;
        municipalityGeocoded: number;
        nearest: MunicipalityRef & { address: string };
      }
    >;
  };
  singleAddressFsas: {
    fsas: number;
    withTwoAddresses: number;
    list: Array<MunicipalityRef & { fsa: string; address: string; buUse: string }>;
  };
};

export const FACTS: FactsData = generated;
