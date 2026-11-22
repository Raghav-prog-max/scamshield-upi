import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The API route reads the prompt files from disk at runtime (they are the
  // single source of truth), so make sure Vercel bundles them with the function.
  outputFileTracingIncludes: {
    "/api/analyze": ["./prompts/final/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
