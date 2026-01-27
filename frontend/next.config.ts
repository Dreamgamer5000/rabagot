import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [],
  rewrites: async () => [
    {
      source: '/api/:path*',
      destination: 'http://127.0.0.1:8000/:path*', // Proxy to Backend
    },
  ],
};

export default nextConfig;
