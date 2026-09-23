import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AboutView, ApiAccessView, PrivacyView, SiteFooter, TermsView } from "./views";
import { checkHealth } from "./api";

const capture = vi.fn();
vi.mock("@posthog/react", () => ({ usePostHog: () => ({ capture }) }));
vi.mock("./api", () => ({ checkHealth: vi.fn() }));

const checkHealthMock = vi.mocked(checkHealth);

beforeEach(() => {
  capture.mockReset();
  checkHealthMock.mockReset();
});

async function submitFirstForm(user: ReturnType<typeof userEvent.setup>) {
  for (const box of screen.getAllByRole("textbox")) {
    if (box.hasAttribute("required")) {
      await user.type(box, box.getAttribute("type") === "email" ? "a@b.co" : "hello");
    }
  }
  await user.click(screen.getByRole("button", { name: /request access|send feedback/i }));
}

describe("AboutView health check", () => {
  it("shows the database and latency when the API is healthy", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof checkHealth>>) => void;
    checkHealthMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const user = userEvent.setup();
    render(<AboutView />);
    expect(screen.getAllByText("Not checked")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Check API" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();

    resolve({ data: { ok: true, database: "random_address_retriever", durationMs: 7 } });
    expect(await screen.findByText("API healthy.")).not.toHaveClass("error");
    expect(screen.getByText("random_address_retriever")).toBeInTheDocument();
    expect(screen.getByText("7 ms")).toBeInTheDocument();
  });

  it.each([
    [new Error("API unreachable"), "API unreachable"],
    ["nope", "Check failed."],
  ])("shows an error when the check fails (%s)", async (thrown, expected) => {
    checkHealthMock.mockRejectedValue(thrown);
    const user = userEvent.setup();
    render(<AboutView />);
    await user.click(screen.getByRole("button", { name: "Check API" }));
    expect(await screen.findByText(expected)).toHaveClass("statusMessage", "error");
  });

  it("records feedback submissions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<AboutView />);
    await submitFirstForm(user);
    expect(await screen.findByText("Thanks for the feedback!")).toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith("feedback_submitted");
  });
});

describe("ApiAccessView", () => {
  it("records API access requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<ApiAccessView />);
    await submitFirstForm(user);
    expect(await screen.findByText(/we got it/i)).toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith("api_access_requested");
  });
});

describe("legal views and footer", () => {
  it.each([
    ["Terms", TermsView],
    ["Privacy", PrivacyView],
  ])("%s links to the feedback form on the About view", async (_name, View) => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<View onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "feedback form" }));
    expect(onNavigate).toHaveBeenCalledWith("about");
  });

  it("navigates to terms, privacy, and feedback from the footer", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SiteFooter onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "Terms of Service" }));
    await user.click(screen.getByRole("button", { name: "Privacy Policy" }));
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    expect(onNavigate.mock.calls).toEqual([["terms"], ["privacy"], ["about"]]);
  });
});
