import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: silence turbopack root warning when multiple lockfiles exist
  turbopack: {
    root: "..",
  },
};

export default nextConfig;
