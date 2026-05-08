/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@consentiq/shared"],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
