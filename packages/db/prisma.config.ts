import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

const localEnvPath = resolve(__dirname, "../../.env");

// Local development may use the repository-root .env.
// Production/runtime should receive DATABASE_URL from the environment.
// Prisma Client generation does not connect to the database, so provide a
// syntactically valid fallback during remote build environments where runtime
// secrets are intentionally unavailable at build time.
if (!process.env.DATABASE_URL && existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://civicos_build:civicos_build@127.0.0.1:5432/civicos_build";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm run seed:run",
  },
  engine: "classic",
  datasource: {
    url: databaseUrl,
  },
});
