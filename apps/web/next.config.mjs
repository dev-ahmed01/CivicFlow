import { resolve } from "node:path";
import dotenv from "dotenv";

// Next loads package-local env files by default; local CivicFlow setup keeps a
// single shared .env at the repository root. Existing injected values win.
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

/** @type {import('next').NextConfig} */
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (process.env.DEPLOYMENT_PROFILE === "production") {
  if (!configuredApiUrl) throw new Error("NEXT_PUBLIC_API_URL is required for production web builds");
  const hostname = new URL(configuredApiUrl).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    throw new Error("NEXT_PUBLIC_API_URL cannot point to localhost in a production web build");
  }
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@civicos/shared"],
};

export default nextConfig;
