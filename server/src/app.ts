import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import {
  type TypeBoxTypeProvider,
  Type,
} from "@fastify/type-provider-typebox";
import type { Config } from "./config";
import type { AddressRecord, Database } from "./db";
import { makeAuthHook } from "./auth";

export interface AppDeps {
  db: Database;
  config: Config;
}

const VERBOSE_TRUE = new Set(["1", "true", "yes", "on"]);

const RandomAddressQuerySchema = Type.Object({
  city: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  province: Type.Optional(
    Type.String({ pattern: "^[A-Za-z]{2}$", description: "Postal province, e.g. ON" }),
  ),
  verbose: Type.Optional(Type.String({ maxLength: 8 })),
});

function shapeResponse(record: AddressRecord, verbose: boolean) {
  const base = {
    address: record.address,
    city: record.city,
    province: record.province,
    postal_code: record.postal_code,
  };
  if (!verbose) {
    return base;
  }
  return { ...base, loc_guid: record.loc_guid, addr_guid: record.addr_guid };
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

  // Every request must carry the API token.
  app.addHook("onRequest", makeAuthHook(config.apiToken));

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      app.log.error(error);
      void reply.code(500).send({ error: "internal_server_error" });
      return;
    }
    void reply.code(status).send({
      error: error.validation ? "invalid_request" : "bad_request",
      message: error.message,
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: "not_found" });
  });

  app.get("/healthz", async () => {
    const { database } = await db.ping();
    return { ok: true, database };
  });

  app.get(
    "/random-address",
    { schema: { querystring: RandomAddressQuerySchema } },
    async (request, reply) => {
      const { city = "Burlington", province, verbose } = request.query;

      const record = await db.randomAddress({
        city,
        province: province ? province.toUpperCase() : undefined,
      });

      if (!record) {
        return reply.code(404).send({ error: "not_found" });
      }

      const isVerbose =
        verbose !== undefined && VERBOSE_TRUE.has(verbose.toLowerCase());
      return shapeResponse(record, isVerbose);
    },
  );

  return app;
}
