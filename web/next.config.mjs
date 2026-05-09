import fs from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  if (!key) return null;
  let value = trimmed.slice(eqIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadRepoRootEnv() {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const files = [
    `.env.${mode}.local`,
    ".env.local",
    `.env.${mode}`,
    ".env",
  ];

  for (const file of files) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(rawLine);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}

// Support running the web app from the monorepo while keeping env in repo root.
loadRepoRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@consentiq/shared"],
  typedRoutes: true,
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
