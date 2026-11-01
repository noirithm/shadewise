import type { NextConfig } from "next";
import { securityHeaders } from "./src/config/security";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  partialPrefetching: true,
};

export default nextConfig;
