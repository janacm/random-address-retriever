import test from "node:test";
import assert from "node:assert/strict";
import { parseAddressQuery, rowToAddress } from "./address-query.mjs";

test("parseAddressQuery defaults to Burlington", () => {
  const query = parseAddressQuery(new URLSearchParams());

  assert.deepEqual(query, {
    city: "Burlington",
    province: null,
    verbose: false,
  });
});

test("parseAddressQuery normalizes province and verbose flags", () => {
  const query = parseAddressQuery(
    new URLSearchParams({ city: "Ottawa", province: "on", verbose: "true" })
  );

  assert.deepEqual(query, {
    city: "Ottawa",
    province: "ON",
    verbose: true,
  });
});

test("parseAddressQuery rejects unknown province codes", () => {
  assert.throws(
    () => parseAddressQuery(new URLSearchParams({ city: "Ottawa", province: "XX" })),
    /Province must be a Canadian postal abbreviation/
  );
});

test("rowToAddress hides source identifiers by default", () => {
  const address = rowToAddress({
    address: "123 MAIN ST",
    city: "Toronto",
    province: "ON",
    postal_code: "M1M 1A1",
    loc_guid: "loc",
    addr_guid: "addr",
  });

  assert.deepEqual(address, {
    address: "123 MAIN ST",
    city: "Toronto",
    province: "ON",
    postalCode: "M1M 1A1",
  });
});

test("rowToAddress includes source identifiers when verbose", () => {
  const address = rowToAddress(
    {
      address: "123 MAIN ST",
      city: "Toronto",
      province: "ON",
      postal_code: "M1M 1A1",
      loc_guid: "loc",
      addr_guid: "addr",
    },
    true
  );

  assert.equal(address.source.locGuid, "loc");
  assert.equal(address.source.addrGuid, "addr");
});
