import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CityCombobox } from "./CityCombobox";
import { fetchCities } from "../api";
import type { CitySuggestion, ProvinceCode } from "../types";

vi.mock("../api", () => ({ fetchCities: vi.fn() }));

const fetchCitiesMock = vi.mocked(fetchCities);

const SUGGESTIONS: CitySuggestion[] = [
  { city: "Burlington", province: "ON", addressCount: 79160 },
  { city: "Burlington", province: "NL", addressCount: 101 },
  { city: "Burnaby", province: null, addressCount: 1200 },
];

function Harness({
  province = "ON",
  initial = "",
  onChange,
}: {
  province?: ProvinceCode | "";
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CityCombobox
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      province={province}
      placeholder="Start typing a city…"
      inputId="city"
    />
  );
}

beforeEach(() => {
  fetchCitiesMock.mockReset();
  fetchCitiesMock.mockResolvedValue(SUGGESTIONS);
});

describe("CityCombobox", () => {
  it("does not query for fewer than two characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "b");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchCitiesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("debounces, queries with the province, and lists suggestions", async () => {
    const user = userEvent.setup();
    render(<Harness province="ON" />);
    await user.type(screen.getByRole("combobox"), "bur");

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(3);
    expect(fetchCitiesMock).toHaveBeenCalledTimes(1);
    expect(fetchCitiesMock).toHaveBeenCalledWith("bur", "ON", expect.any(AbortSignal));
    expect(options[0]).toHaveTextContent("ON · 79,160 addresses");
    expect(options[2]).toHaveTextContent("Canada · 1,200 addresses");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("selects with the keyboard and does not re-query for the chosen value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bur");
    await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(input).toHaveValue("Burlington");
    expect(onChange).toHaveBeenLastCalledWith("Burlington");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchCitiesMock).toHaveBeenCalledTimes(1);
  });

  it("still looks up the next edit after picking the city already typed", async () => {
    fetchCitiesMock.mockResolvedValue([{ city: "Burlington", province: "ON", addressCount: 3 }]);
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Burlington");
    await user.click(await screen.findByRole("option"));
    expect(input).toHaveValue("Burlington");
    const callsBefore = fetchCitiesMock.mock.calls.length;

    await user.type(input, "{Backspace}");
    await waitFor(() =>
      expect(fetchCitiesMock).toHaveBeenLastCalledWith("Burlingto", "ON", expect.any(AbortSignal))
    );
    expect(fetchCitiesMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("selects with the mouse", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bur");
    const options = await screen.findAllByRole("option");

    await user.hover(options[2]);
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    await user.click(options[2]);
    expect(input).toHaveValue("Burnaby");
  });

  it("closes on Escape and on blur, and reopens on focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bur");
    await screen.findAllByRole("option");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Keys are ignored while the list is closed.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("bur");

    await user.tab();
    await user.click(input);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("leaves Enter alone when no option is highlighted", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bur");
    await screen.findAllByRole("option");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("bur");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("clears suggestions when the lookup fails, leaving a plain text field", async () => {
    fetchCitiesMock.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "bur");
    await waitFor(() => expect(fetchCitiesMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("bur");
  });

  it("drops suggestions once the term is cleared below two characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bur");
    await screen.findAllByRole("option");
    await user.clear(input);
    await user.type(input, "b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
