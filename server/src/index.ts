import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPgDatabase } from "./db";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPgDatabase(config);
  const app = buildApp({ db, config });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    // Bound shutdown: a stuck in-flight query (e.g. statement_timeout disabled)
    // can keep app.close()/pool.end() pending forever. Force-exit so an
    // orchestrator never has to SIGKILL us. Unref'd so it can't keep us alive.
    const forceExit = setTimeout(() => {
      app.log.error("forced exit after shutdown timeout");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    try {
      await app.close();
      await db.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
