import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [],
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `http://${process.env.BACKEND_HOSTNAME}/:path*`, // Proxy to Backend
    },
  ],
};

export default nextConfig;
