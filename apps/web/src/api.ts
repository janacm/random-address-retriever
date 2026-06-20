import type { HealthResponse, RandomAddressQuery, RandomAddressResponse } from "./types";

const LOCAL_DEV_TOKEN = "local-dev-token";
const ADDRESS_API_TOKEN = import.meta.env.VITE_ADDRESS_API_TOKEN ?? LOCAL_DEV_TOKEN;

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class AddressApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AddressApiError";
    this.status = status;
  }
}

function authHeaders() {
  return {
    authorization: `Bearer ${ADDRESS_API_TOKEN}`,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiErrorBody;

  if (!response.ok) {
    throw new AddressApiError(
      body.error?.message ?? `Request failed with ${response.status}`,
      response.status
    );
  }

  return body;
}

export async function fetchRandomAddress(query: RandomAddressQuery) {
  const params = new URLSearchParams({
    city: query.city,
    verbose: String(query.verbose),
  });

  if (query.province) {
    params.set("province", query.province);
  }

  const response = await fetch(`/api/random-address?${params}`, {
    headers: authHeaders(),
  });

  return readJson<RandomAddressResponse>(response);
}

export async function checkHealth() {
  const response = await fetch("/healthz", {
    headers: authHeaders(),
  });

  return readJson<HealthResponse>(response);
}
