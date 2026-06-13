import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile in the home dir otherwise gets
  // mis-detected as the Turbopack root).
  turbopack: {
    root: path.resolve(__dirname),
  },
  reactStrictMode: true,
  images: {
    // Next 16: `domains` is deprecated; use remotePatterns (scoped to hosts we
    // actually render). Pruned the unused portfolio-template hosts.
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "imgur.com" },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
