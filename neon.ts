import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    // The slug is permanent: it is part of the invocation URL the Netlify
    // proxy calls (ADDRESS_API_URL).
    addressapi: {
      name: "random address api",
      source: "server/src/function.ts",
      // ADDRESS_API_TOKEN is deliberately not declared here, so evaluating this
      // file never needs the secret. It is set on the deployment once with
      // `neon functions deploy addressapi --env ADDRESS_API_TOKEN=...` and
      // carries over across later deploys (see docs/DEPLOY.md).
    },
  },
});
