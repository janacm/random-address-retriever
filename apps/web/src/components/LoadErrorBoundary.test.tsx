import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lazy, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadErrorBoundary } from "./LoadErrorBoundary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoadErrorBoundary", () => {
  it("renders its children when nothing fails", () => {
    render(
      <LoadErrorBoundary what="facts">
        <p>Loaded</p>
      </LoadErrorBoundary>
    );
    expect(screen.getByText("Loaded")).toBeInTheDocument();
  });

  it("shows a reload prompt instead of unmounting when a lazy chunk fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onReload = vi.fn();
    const Broken = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    render(
      <main>
        <p>Rest of the app</p>
        <LoadErrorBoundary what="facts" onReload={onReload}>
          <Suspense fallback={<p>Loading</p>}>
            <Broken />
          </Suspense>
        </LoadErrorBoundary>
      </main>
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load facts");
    expect(screen.getByText("Rest of the app")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("reloads the page by default", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    function Throws(): never {
      throw new Error("boom");
    }
    render(
      <LoadErrorBoundary what="facts">
        <Throws />
      </LoadErrorBoundary>
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
