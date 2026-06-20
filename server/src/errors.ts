/** Raised for invalid caller input; mapped to a 400 envelope by the app. */
export class ValidationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}
