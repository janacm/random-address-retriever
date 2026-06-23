import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import {
  type TypeBoxTypeProvider,
  Type,
} from "@fastify/type-provider-typebox";
import type { Config } from "./config";
import type { Database } from "./db";
import { makeAuthHook } from "./auth";
import { ValidationError } from "./errors";
import { makeCorsHook, makeRateLimitHook } from "./hooks";
import { PROVINCES } from "./provinces";
import { parseAddressQuery, parseCitiesQuery, toAddressPayload } from "./query";

export interface AppDeps {
  db: Database;
  config: Config;
}

const RandomAddressQuerySchema = Type.Object({
  city: Type.Optional(Type.String()),
  province: Type.Optional(Type.String()),
  verbose: Type.Optional(Type.String()),
});

const CitiesQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  province: Type.Optional(Type.String()),
  limit: Type.Optional(Type.String()),
});

function elapsedMs(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

/**
 * Build the Fastify instance without binding a port. Returning the app
 * (rather than starting a server) is what makes the HTTP layer unit-testable
 * via `app.inject(...)`.
 */
export function buildApp({ db, config }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: config.logger,
    disableRequestLogging: !config.logger,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Order matters: CORS answers preflight before auth can reject it; the rate
  // limiter runs before auth so unauthenticated floods are still bounded.
  app.addHook("onRequest", makeCorsHook(config.corsOrigins));
  app.addHook("onRequest", makeRateLimitHook(config.rateLimit));
  app.addHook("onRequest", makeAuthHook(config.apiToken));

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ValidationError) {
      void reply.code(400).send({
        error: {
          code: "bad_request",
          message: error.message,
          details: error.details,
        },
      });
      return;
    }
    if (error.validation) {
      void reply
        .code(400)
        .send({ error: { code: "bad_request", message: error.message } });
      return;
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      app.log.error(error);
      void reply.code(500).send({
        error: { code: "internal_error", message: "Address lookup failed." },
      });
      return;
    }
    void reply
      .code(status)
      .send({ error: { code: "bad_request", message: error.message } });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply
      .code(404)
      .send({ error: { code: "not_found", message: "Route not found." } });
  });

  app.get("/healthz", async () => {
    const startedAt = process.hrtime.bigint();
    const { database } = await db.ping();
    return { data: { ok: true, database, durationMs: elapsedMs(startedAt) } };
  });

  app.get("/api/provinces", async () => ({ data: PROVINCES }));

  app.get(
    "/api/cities",
    { schema: { querystring: CitiesQuerySchema } },
    async (request) => {
      const query = parseCitiesQuery(request.query);
      const startedAt = process.hrtime.bigint();
      const cities = await db.listCities({
        q: query.q,
        province: query.province ?? undefined,
        limit: query.limit,
      });

      return {
        data: cities,
        meta: {
          q: query.q,
          province: query.province,
          count: cities.length,
          durationMs: elapsedMs(startedAt),
        },
      };
    },
  );

  app.get(
    "/api/random-address",
    { schema: { querystring: RandomAddressQuerySchema } },
    async (request, reply) => {
      const query = parseAddressQuery(request.query);
      const startedAt = process.hrtime.bigint();
      const record = await db.randomAddress({
        city: query.city,
        province: query.province ?? undefined,
      });

      if (!record) {
        return reply.code(404).send({
          error: {
            code: "not_found",
            message: "No address matched that city and province.",
          },
          meta: { city: query.city, province: query.province },
        });
      }

      return {
        data: toAddressPayload(record, query.verbose),
        meta: {
          city: query.city,
          province: query.province,
          verbose: query.verbose,
          durationMs: elapsedMs(startedAt),
        },
      };
    },
  );

  return app;
}
