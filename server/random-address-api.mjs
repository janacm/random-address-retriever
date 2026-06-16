#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";

const HOST = process.env.ADDRESS_API_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.ADDRESS_API_PORT || "8787", 10);
const API_TOKEN = process.env.ADDRESS_API_TOKEN;
const PSQL_BIN = process.env.PSQL_BIN || "psql";

if (!API_TOKEN) {
  console.error("ADDRESS_API_TOKEN is required.");
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("ADDRESS_API_PORT must be a valid TCP port.");
  process.exit(1);
}

const randomAddressSql = `
WITH picked AS (
  SELECT
    concat_ws(
      ' ',
      nullif(apt_no_label, ''),
      nullif(civic_no, ''),
      nullif(civic_no_suffix, ''),
      nullif(official_street_name, ''),
      nullif(official_street_type, ''),
      nullif(official_street_dir, '')
    ) AS address,
    csd_eng_name AS city,
    mail_prov_abvn AS province,
    mail_postal_code AS postal_code,
    loc_guid,
    addr_guid
  FROM nar_addresses
  WHERE lower(csd_eng_name) = lower(:'city')
    AND (:'province' = '' OR upper(mail_prov_abvn) = upper(:'province'))
  ORDER BY random()
  LIMIT 1
)
SELECT (
  jsonb_build_object(
    'address', address,
    'city', city,
    'province', province,
    'postal_code', postal_code
  ) ||
  CASE
    WHEN :'verbose'::boolean THEN jsonb_build_object('loc_guid', loc_guid, 'addr_guid', addr_guid)
    ELSE '{}'::jsonb
  END
)::text
FROM picked;
`;

const healthSql = `
SELECT jsonb_build_object(
  'ok', true,
  'database', current_database()
)::text;
`;

function hash(value) {
  return createHash("sha256").update(value).digest();
}

function tokensEqual(actual, expected) {
  return timingSafeEqual(hash(actual), hash(expected));
}

function bearerToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerToken = request.headers["x-api-token"];
  return Array.isArray(headerToken) ? headerToken[0] : headerToken || "";
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function validateText(name, value, { required = false, maxLength = 100 } = {}) {
  const trimmed = (value || "").trim();

  if (required && trimmed.length === 0) {
    throw Object.assign(new Error(`${name} is required`), { status: 400 });
  }

  if (trimmed.length > maxLength) {
    throw Object.assign(new Error(`${name} must be ${maxLength} characters or fewer`), { status: 400 });
  }

  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw Object.assign(new Error(`${name} contains invalid control characters`), { status: 400 });
  }

  return trimmed;
}

function validateProvince(value) {
  const province = validateText("province", value, { maxLength: 2 }).toUpperCase();

  if (province && !/^[A-Z]{2}$/.test(province)) {
    throw Object.assign(new Error("province must be a two-letter abbreviation such as ON"), { status: 400 });
  }

  return province;
}

function runPsql(sql, variables = {}) {
  const args = [
    "-X",
    "--no-psqlrc",
    "-h",
    process.env.PGHOST || "127.0.0.1",
    "-p",
    process.env.PGPORT || "55432",
    "-d",
    process.env.PGDATABASE || "random_address_retriever",
    "-U",
    process.env.PGUSER || os.userInfo().username,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atq",
  ];

  for (const [key, value] of Object.entries(variables)) {
    args.push("-v", `${key}=${value}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(PSQL_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdin.end(sql);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `psql exited with code ${code}`));
    });
  });
}

async function randomAddress(searchParams) {
  const city = validateText("city", searchParams.get("city") || "Burlington", { required: true });
  const province = validateProvince(searchParams.get("province") || "");
  const verbose = ["1", "true", "yes"].includes((searchParams.get("verbose") || "").toLowerCase());

  const output = await runPsql(randomAddressSql, {
    city,
    province,
    verbose: String(verbose),
  });

  if (!output) {
    throw Object.assign(new Error("No address found for the requested city/province"), { status: 404 });
  }

  return JSON.parse(output);
}

async function handleRequest(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (!tokensEqual(bearerToken(request), API_TOKEN)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (url.pathname === "/healthz") {
      sendJson(response, 200, JSON.parse(await runPsql(healthSql)));
      return;
    }

    if (url.pathname === "/random-address") {
      sendJson(response, 200, await randomAddress(url.searchParams));
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    sendJson(response, status, {
      error: status === 500 ? "internal_server_error" : error.message,
    });

    if (status === 500) {
      console.error(error);
    }
  }
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Random address API listening on http://${HOST}:${PORT}`);
});
