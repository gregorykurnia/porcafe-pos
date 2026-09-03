import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // These pages fetch their data client-side from Firestore on mount, but are
    // statically prerendered (no server dynamic data), so Next's default Link
    // prefetching caches the rendered page segment for 5 minutes (the "static"
    // stale time). That meant navigating away right after a write (e.g. the
    // ticket scanner writing to Firestore) and back showed the stale
    // pre-scan snapshot instead of re-running the fetch. Disable that cache so
    // every navigation re-mounts the page and refetches.
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
