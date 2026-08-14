import type { NextConfig } from "next";

const backendHost = process.env.BACKEND_HOSTNAME || (process.env.NODE_ENV === "production" ? "picshare-backend:8000" : "localhost:8000");
const backendUrl = backendHost.startsWith("http://") || backendHost.startsWith("https://") ? backendHost : `http://${backendHost}`;

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [],
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${backendUrl}/:path*`, // Proxy to Backend
    },
  ],
};

export default nextConfig;
