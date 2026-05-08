/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@consentiq/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
