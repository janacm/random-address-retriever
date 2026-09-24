import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressApiError, checkHealth, fetchCities, fetchRandomAddress } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fetchRandomAddress", () => {
  it("sends city, verbose, and province with the dev bearer token", async () => {
    const body = { data: { address: "1 Main ST" }, meta: { durationMs: 3 } };
    const fetchSpy = mockFetch(jsonResponse(body));

    await expect(
      fetchRandomAddress({ city: "Burlington", province: "ON", verbose: true })
    ).resolves.toEqual(body);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/random-address?city=Burlington&verbose=true&province=ON");
    expect(init?.headers).toEqual({ authorization: "Bearer local-dev-token" });
  });

  it("omits the province when searching all of Canada", async () => {
    const fetchSpy = mockFetch(jsonResponse({ data: {}, meta: {} }));
    await fetchRandomAddress({ city: "Toronto", province: "", verbose: false });
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/random-address?city=Toronto&verbose=false");
  });

  it("sends no auth header outside dev, where the edge proxy adds it", async () => {
    vi.stubEnv("DEV", false);
    const fetchSpy = mockFetch(jsonResponse({ data: {}, meta: {} }));
    await fetchRandomAddress({ city: "Toronto", province: "", verbose: false });
    expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({});
  });

  it("throws AddressApiError with the API message and status", async () => {
    mockFetch(jsonResponse({ error: { code: "not_found", message: "No address." } }, 404));
    const error = await fetchRandomAddress({ city: "X", province: "", verbose: false }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(AddressApiError);
    expect(error).toMatchObject({ message: "No address.", status: 404 });
  });

  it("falls back to a generic message when the error body has none", async () => {
    mockFetch(jsonResponse({}, 502));
    await expect(
      fetchRandomAddress({ city: "X", province: "", verbose: false })
    ).rejects.toThrow("Request failed with 502");
  });
});

describe("fetchCities", () => {
  it("returns the data array and forwards the abort signal", async () => {
    const cities = [{ city: "Burlington", province: "ON", addressCount: 3 }];
    const fetchSpy = mockFetch(jsonResponse({ data: cities, meta: {} }));
    const controller = new AbortController();

    await expect(fetchCities("burl", "ON", controller.signal)).resolves.toEqual(cities);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/cities?q=burl&province=ON");
    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("omits the province when none is selected", async () => {
    const fetchSpy = mockFetch(jsonResponse({ data: [], meta: {} }));
    await fetchCities("to", "");
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/cities?q=to");
  });
});

describe("checkHealth", () => {
  it("returns the health envelope", async () => {
    const body = { data: { ok: true, database: "db", durationMs: 1 } };
    const fetchSpy = mockFetch(jsonResponse(body));
    await expect(checkHealth()).resolves.toEqual(body);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/healthz");
  });
});
