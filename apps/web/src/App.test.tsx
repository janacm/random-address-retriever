import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AddressApiError, checkHealth, fetchCities, fetchRandomAddress } from "./api";
import type { RandomAddressResponse } from "./types";

const capture = vi.fn();
vi.mock("@posthog/react", () => ({ usePostHog: () => ({ capture }) }));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    fetchRandomAddress: vi.fn(),
    fetchCities: vi.fn(),
    checkHealth: vi.fn(),
  };
});

const fetchRandomAddressMock = vi.mocked(fetchRandomAddress);

const RESULT: RandomAddressResponse = {
  data: {
    address: "586 Phoebe CRES",
    city: "Burlington",
    province: "ON",
    postalCode: "L7L6H7",
  },
  meta: { city: "Burlington", province: "ON", verbose: false, durationMs: 12 },
};

const VERBOSE_RESULT: RandomAddressResponse = {
  data: { ...RESULT.data, source: { locGuid: "loc-1", addrGuid: "addr-1" } },
  meta: { ...RESULT.meta, verbose: true },
};

beforeEach(() => {
  capture.mockReset();
  fetchRandomAddressMock.mockReset();
  vi.mocked(fetchCities).mockResolvedValue([]);
  vi.mocked(checkHealth).mockReset();
});

function getAddressButton() {
  return screen.getByRole("button", { name: /get address/i });
}

describe("App retriever", () => {
  it("starts empty with Burlington, ON as the query", () => {
    render(<App />);
    expect(screen.getByText("No address yet")).toBeInTheDocument();
    expect(screen.getByText("Burlington, ON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy address" })).toBeDisabled();
  });

  it("retrieves an address, links to Google Maps, and records the event", async () => {
    fetchRandomAddressMock.mockResolvedValue(RESULT);
    const user = userEvent.setup();
    render(<App />);

    await user.click(getAddressButton());

    expect(await screen.findByText("586 Phoebe CRES")).toBeInTheDocument();
    expect(fetchRandomAddressMock).toHaveBeenCalledWith({
      city: "Burlington",
      province: "ON",
      verbose: false,
    });
    const mapsLink = screen.getByRole("link", { name: /view on google maps/i });
    expect(mapsLink).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent("586 Phoebe CRES, Burlington, ON, L7L6H7, Canada")
    );
    expect(screen.getByText("12 ms")).toBeInTheDocument();
    expect(screen.queryByText("LOC_GUID")).not.toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith("address_retrieved", {
      city: "Burlington",
      province: "ON",
      postal_code: "L7L6H7",
      verbose: false,
      query_duration_ms: 12,
    });
  });

  it("shows a loading state while the request is in flight", async () => {
    let resolve!: (value: RandomAddressResponse) => void;
    fetchRandomAddressMock.mockReturnValue(
      new Promise<RandomAddressResponse>((r) => {
        resolve = r;
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(getAddressButton());
    expect(screen.getByRole("button", { name: /retrieving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh address" })).toBeDisabled();

    resolve(RESULT);
    expect(await screen.findByText("586 Phoebe CRES")).toBeInTheDocument();
  });

  it("requests source identifiers when the toggle is on", async () => {
    fetchRandomAddressMock.mockResolvedValue(VERBOSE_RESULT);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("checkbox", { name: "Source identifiers" }));
    await user.click(getAddressButton());

    expect(await screen.findByText("loc-1")).toBeInTheDocument();
    expect(screen.getByText("addr-1")).toBeInTheDocument();
    expect(fetchRandomAddressMock).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true })
    );
  });

  it("searches all of Canada and falls back to Burlington for a blank city", async () => {
    fetchRandomAddressMock.mockResolvedValue(RESULT);
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole("combobox", { name: /province/i }), "");
    await user.clear(screen.getByPlaceholderText("Start typing a city…"));
    expect(screen.getAllByText("All provinces").length).toBeGreaterThan(1);

    await user.click(getAddressButton());
    expect(fetchRandomAddressMock).toHaveBeenCalledWith({
      city: "Burlington",
      province: "",
      verbose: false,
    });
  });

  it("shows the API error message and records the status", async () => {
    fetchRandomAddressMock.mockRejectedValue(
      new AddressApiError("No address matched that city and province.", 404)
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(getAddressButton());

    const message = await screen.findByText("No address matched that city and province.");
    expect(message).toHaveClass("statusMessage", "error");
    expect(capture).toHaveBeenCalledWith("address_retrieval_failed", {
      city: "Burlington",
      province: "ON",
      error_message: "No address matched that city and province.",
      error_status: 404,
    });
  });

  it.each([
    [new Error("Network down"), "Network down"],
    ["boom", "Unexpected request failure."],
  ])("reports a non-API failure (%s)", async (thrown, expected) => {
    fetchRandomAddressMock.mockRejectedValue(thrown);
    const user = userEvent.setup();
    render(<App />);

    await user.click(getAddressButton());

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith(
      "address_retrieval_failed",
      expect.objectContaining({ error_message: expected, error_status: undefined })
    );
  });

  it("copies the address with source identifiers to the clipboard", async () => {
    fetchRandomAddressMock.mockResolvedValue(VERBOSE_RESULT);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<App />);

    await user.click(getAddressButton());
    await screen.findByText("586 Phoebe CRES");
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(writeText).toHaveBeenCalledWith(
      "586 Phoebe CRES\nBurlington, ON L7L6H7\nLOC_GUID: loc-1\nADDR_GUID: addr-1"
    );
    expect(await screen.findByText("Address copied.")).not.toHaveClass("error");
    expect(capture).toHaveBeenCalledWith("address_copied", {
      city: "Burlington",
      province: "ON",
      postal_code: "L7L6H7",
    });
  });

  it("refreshes by resubmitting the form", async () => {
    fetchRandomAddressMock.mockResolvedValue(RESULT);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Refresh address" }));
    await screen.findByText("586 Phoebe CRES");
    expect(fetchRandomAddressMock).toHaveBeenCalledTimes(1);
  });
});

describe("App navigation", () => {
  it("switches between views from the nav, footer, and brand", async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });

    await user.click(within(nav).getByRole("button", { name: "API access" }));
    expect(screen.getByRole("heading", { name: "Build on the address index" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "API access" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(within(nav).getByRole("button", { name: "About" }));
    expect(
      screen.getByRole("heading", { name: "Where these addresses come from" })
    ).toBeInTheDocument();

    const footer = screen.getByRole("navigation", { name: "Legal and contact" });
    await user.click(within(footer).getByRole("button", { name: "Terms of Service" }));
    expect(screen.getByRole("heading", { level: 2, name: /terms/i })).toBeInTheDocument();

    await user.click(within(footer).getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByRole("heading", { level: 2, name: /privacy/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Random Address Retriever" }));
    expect(screen.getByText("No address yet")).toBeInTheDocument();
  });

  it("opens the Facts page from the nav, right after Retriever", async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Retriever",
      "Facts",
      "API access",
      "About",
    ]);

    await user.click(within(nav).getByRole("button", { name: "Facts" }));
    // lazy-loaded, so the heading arrives after the Suspense fallback
    expect(
      await screen.findByRole("heading", { level: 2, name: "Facts from the National Address Register" })
    ).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Facts" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("No address yet")).not.toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Retriever" }));
    expect(screen.getByText("No address yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Facts from the National Address Register" })).toBeNull();
  });
});
