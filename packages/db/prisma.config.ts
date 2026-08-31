import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

if (!process.env.DATABASE_URL) {
  process.loadEnvFile(resolve(__dirname, "../../.env"));
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
