import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@consentiq/shared"],
  typedRoutes: true,
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
};

export default nextConfig;
