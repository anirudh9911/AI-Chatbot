import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build in .next/standalone — required for the
  // multi-stage Docker runner stage. The output includes a minimal node_modules
  // so the production image doesn't need the full 300MB node_modules directory.
  output: "standalone",
};

export default nextConfig;
