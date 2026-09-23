import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NetlifyForm, type NetlifyFieldDef } from "./NetlifyForm";

const FIELDS: NetlifyFieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email" },
  { name: "topic", label: "Topic", type: "select", options: ["Bug", "Feature"] },
  { name: "message", label: "Message", type: "textarea", required: true },
];

function renderForm(onSubmitSuccess?: () => void) {
  render(
    <NetlifyForm
      formName="feedback"
      fields={FIELDS}
      submitLabel="Send"
      successTitle="Thanks!"
      successMessage="We got it."
      onSubmitSuccess={onSubmitSuccess}
    />
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Name *" }), "Jane & Co");
  await user.type(screen.getByRole("textbox", { name: "Email" }), "jane@example.com");
  await user.selectOptions(screen.getByRole("combobox", { name: "Topic" }), "Feature");
  await user.type(screen.getByRole("textbox", { name: "Message *" }), "Hi there");
  await user.click(screen.getByRole("button", { name: "Send" }));
  return user;
}

describe("NetlifyForm", () => {
  it("renders required markers and defaults a select to its first option", () => {
    renderForm();
    expect(screen.getByRole("textbox", { name: "Name *" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveValue("Bug");
    expect(document.querySelector('input[name="form-name"]')).toHaveValue("feedback");
  });

  it("posts url-encoded values with form-name and shows the success state", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const onSubmitSuccess = vi.fn();
    renderForm(onSubmitSuccess);

    await fillAndSubmit();

    expect(await screen.findByRole("status")).toHaveTextContent("Thanks!We got it.");
    expect(onSubmitSuccess).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(init?.body).toBe(
      "form-name=feedback&name=Jane%20%26%20Co&email=jane%40example.com&topic=Feature&message=Hi%20there"
    );
  });

  it("includes the honeypot field when a bot fills it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderForm();
    const user = userEvent.setup();
    const honeypot = document.querySelector('input[name="bot-field"]') as HTMLInputElement;
    await user.type(honeypot, "spam");
    await fillAndSubmit();
    await screen.findByRole("status");
    expect(String(fetchSpy.mock.calls[0][1]?.body)).toContain("bot-field=spam");
  });

  it("shows the HTTP status on a failed submission and lets the user retry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const onSubmitSuccess = vi.fn();
    renderForm(onSubmitSuccess);

    await fillAndSubmit();

    expect(
      await screen.findByText("Submission failed (500). Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(onSubmitSuccess).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("offline");
    renderForm();
    await fillAndSubmit();
    expect(
      await screen.findByText("Submission failed. Please try again.")
    ).toBeInTheDocument();
  });

  it("disables the button while submitting", async () => {
    let resolve!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      })
    );
    renderForm();
    await fillAndSubmit();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    resolve(new Response(null, { status: 200 }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
