import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["node:sqlite"],
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { cpus: 1 },
};

export default nextConfig;
