import fs from "node:fs";
import path from "node:path";

const monorepoRoot = path.join(import.meta.dirname, "..");
hydrateEnvFromRoot(monorepoRoot);

const nextPublicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const nextPublicSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

function hydrateEnvFromRoot(rootDir) {
  const candidates = [".env.local", ".env"];
  for (const name of candidates) {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      if (!key || process.env[key] !== undefined) continue;
      const value = line
        .slice(eqIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@consentiq/shared"],
  typedRoutes: true,
  outputFileTracingRoot: monorepoRoot,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  env: {
    ...(nextPublicSupabaseUrl
      ? { NEXT_PUBLIC_SUPABASE_URL: nextPublicSupabaseUrl }
      : {}),
    ...(nextPublicSupabasePublishableKey
      ? { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nextPublicSupabasePublishableKey }
      : {}),
  },
};

export default nextConfig;
