import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { extractToken, tokensMatch } from "../src/auth";

function requestWith(
  headers: Record<string, string | string[] | undefined>,
): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

describe("extractToken", () => {
  it("reads an Authorization: Bearer token", () => {
    expect(extractToken(requestWith({ authorization: "Bearer abc123" }))).toBe("abc123");
  });

  it("reads a string X-Api-Token header", () => {
    expect(extractToken(requestWith({ "x-api-token": "abc123" }))).toBe("abc123");
  });

  it("reads the first value of an array-valued X-Api-Token header", () => {
    expect(extractToken(requestWith({ "x-api-token": ["abc123", "second"] }))).toBe("abc123");
  });

  it("returns an empty string when no token header is present", () => {
    expect(extractToken(requestWith({}))).toBe("");
  });
});

describe("tokensMatch", () => {
  it("accepts identical tokens", () => {
    expect(tokensMatch("a-long-secret", "a-long-secret")).toBe(true);
  });

  it("rejects different tokens of equal length", () => {
    expect(tokensMatch("abcdef", "abcdeg")).toBe(false);
  });

  it("rejects tokens of different length without throwing", () => {
    expect(tokensMatch("short", "a-much-longer-token")).toBe(false);
  });

  it("rejects an empty token against a real one", () => {
    expect(tokensMatch("", "secret")).toBe(false);
  });
});
