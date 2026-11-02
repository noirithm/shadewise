import type { NextConfig } from "next";
import { securityHeaders } from "./src/config/security";

const nextConfig: NextConfig = {
  devIndicators: false,

  cacheComponents: true,

  async headers() {
    const headers = securityHeaders();

    if (headers.length === 0) {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },

  partialPrefetching: true,
};

export default nextConfig;