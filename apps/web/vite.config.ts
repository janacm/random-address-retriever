import path from "node:path";
import react from "@vitejs/plugin-react";
import posthog from "@posthog/rollup-plugin";
import { defineConfig, type Plugin } from "vite";

/**
 * PostHog source-map upload plugin. Only enabled when the PostHog upload env
 * vars are present (CI/production builds), so local dev builds don't attempt
 * network uploads and never need a personal API key. Generates source maps,
 * injects chunk metadata, uploads them to PostHog, then deletes the local
 * `.map` files so they aren't shipped to the CDN.
 */
function posthogPlugin(): Plugin {
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    return { name: "posthog-noop" };
  }
  return posthog({
    personalApiKey: apiKey,
    projectId,
    host: process.env.POSTHOG_HOST,
    sourcemaps: {
      enabled: true,
      releaseName: "random-address-web",
      deleteAfterUpload: true,
    },
  }) as Plugin;
}

/**
 * Dev-only emulation of Netlify Forms. In production, Netlify's CDN intercepts
 * the `POST /` that NetlifyForm.tsx sends and captures the submission; under
 * Vite there is no such handler, so the post 404s. This middleware accepts the
 * url-encoded submission, logs it to the terminal so you can verify the payload,
 * and returns 200 — mirroring Netlify closely enough to exercise the form's
 * success path locally. It only runs under `vite` dev (configureServer is not
 * called for `vite build`), so production output is unaffected.
 */
function netlifyFormsDevPlugin(): Plugin {
  return {
    name: "netlify-forms-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const contentType = req.headers["content-type"] ?? "";
        if (
          req.method !== "POST" ||
          !contentType.includes("application/x-www-form-urlencoded")
        ) {
          return next();
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          const params = new URLSearchParams(body);
          const formName = params.get("form-name");
          // Not a Netlify form post — let Vite handle it normally.
          if (!formName) {
            return next();
          }

          const fields = Object.fromEntries(
            [...params.entries()].filter(([key]) => key !== "form-name")
          );
          server.config.logger.info(
            `\n[netlify-forms] received "${formName}":\n${JSON.stringify(fields, null, 2)}`
          );

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/plain");
          res.end("OK");
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), netlifyFormsDevPlugin(), posthogPlugin()].filter(Boolean),
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
