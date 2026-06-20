export const runtime = "nodejs";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const city = requestUrl.searchParams.get("city") ?? "Burlington";
  const province = requestUrl.searchParams.get("province") ?? "";
  const verbose = requestUrl.searchParams.get("verbose") ?? "";

  const upstream = new URL(requiredEnv("ADDRESS_API_URL"));
  upstream.pathname = "/api/random-address";
  upstream.searchParams.set("city", city);
  if (province) {
    upstream.searchParams.set("province", province);
  }
  if (verbose) {
    upstream.searchParams.set("verbose", verbose);
  }

  const response = await fetch(upstream, {
    headers: {
      Authorization: `Bearer ${requiredEnv("ADDRESS_API_TOKEN")}`,
      "CF-Access-Client-Id": requiredEnv("CF_ACCESS_CLIENT_ID"),
      "CF-Access-Client-Secret": requiredEnv("CF_ACCESS_CLIENT_SECRET"),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({
    error: "invalid_upstream_response",
  }));

  return Response.json(payload, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
    },
  });
}
