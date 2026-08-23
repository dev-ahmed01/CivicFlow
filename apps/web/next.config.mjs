/** @type {import('next').NextConfig} */
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (process.env.NODE_ENV === "production") {
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
