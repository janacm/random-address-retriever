import { FormEvent, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export interface NetlifyFieldDef {
  name: string;
  label: string;
  type: "text" | "email" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface NetlifyFormProps {
  /** Must match a form declared in index.html so Netlify detects it at deploy. */
  formName: string;
  fields: NetlifyFieldDef[];
  submitLabel: string;
  successTitle: string;
  successMessage: string;
}

function encode(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key] ?? "")}`)
    .join("&");
}

function initialValues(fields: NetlifyFieldDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] =
      field.type === "select" && field.options?.length ? field.options[0] : "";
  }
  return values;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

/**
 * A Netlify-backed form. Submissions POST to "/" as url-encoded data with the
 * `form-name` field Netlify expects; Netlify then captures the entry and can
 * email it for free (enable in Site settings → Forms → notifications). A
 * matching hidden form in index.html is what makes Netlify detect it at build,
 * since this React form is not present in the static HTML.
 */
export function NetlifyForm({
  formName,
  fields,
  submitLabel,
  successTitle,
  successMessage,
}: NetlifyFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(fields)
  );
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  function setField(name: string, value: string) {
    setValues((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode({ "form-name": formName, ...values }),
      });

      if (!response.ok) {
        throw new Error(`Submission failed (${response.status}). Please try again.`);
      }

      setStatus("success");
    } catch (submitError) {
      setStatus("error");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Submission failed. Please try again."
      );
    }
  }

  if (status === "success") {
    return (
      <div className="formSuccess" role="status">
        <CheckCircle2 aria-hidden="true" size={26} />
        <div>
          <h3>{successTitle}</h3>
          <p>{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      name={formName}
      className="netlifyForm"
      onSubmit={handleSubmit}
      data-netlify="true"
      data-netlify-honeypot="bot-field"
    >
      <input type="hidden" name="form-name" value={formName} />
      <p className="honeypot" hidden>
        <label>
          Leave this field empty:{" "}
          <input
            name="bot-field"
            tabIndex={-1}
            autoComplete="off"
            onChange={(event) => setField("bot-field", event.target.value)}
          />
        </label>
      </p>

      {fields.map((field) => (
        <label className="field" key={field.name}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          {field.type === "textarea" ? (
            <textarea
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              rows={4}
              value={values[field.name] ?? ""}
              onChange={(event) => setField(field.name, event.target.value)}
            />
          ) : field.type === "select" ? (
            <select
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={(event) => setField(field.name, event.target.value)}
            >
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              autoComplete="off"
              value={values[field.name] ?? ""}
              onChange={(event) => setField(field.name, event.target.value)}
            />
          )}
        </label>
      ))}

      {status === "error" ? <p className="statusMessage error">{error}</p> : null}

      <button className="primaryButton" type="submit" disabled={status === "submitting"}>
        <Send aria-hidden="true" size={18} />
        <span>{status === "submitting" ? "Sending…" : submitLabel}</span>
      </button>
    </form>
  );
}
