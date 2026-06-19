export type ProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export type AddressSource = {
  locGuid: string;
  addrGuid: string;
};

export type RandomAddress = {
  address: string;
  city: string;
  province: ProvinceCode;
  postalCode: string;
  source?: AddressSource;
};

export type RandomAddressResponse = {
  data: RandomAddress;
  meta: {
    city: string;
    province: ProvinceCode | null;
    verbose: boolean;
    durationMs: number;
  };
};

export type HealthResponse = {
  data: {
    ok: boolean;
    database: string;
    durationMs: number;
  };
};

export type RandomAddressQuery = {
  city: string;
  province: ProvinceCode | "";
  verbose: boolean;
};
