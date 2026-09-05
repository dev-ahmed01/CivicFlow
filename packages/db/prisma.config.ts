import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

const localEnvPath = resolve(__dirname, "../../.env");

// Local development may use the repository-root .env.
// Production/Docker should receive DATABASE_URL from the environment.
if (!process.env.DATABASE_URL && existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm run seed:run",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});