import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // These pages fetch their data client-side from Firestore on mount, but are
    // statically prerendered (no server dynamic data), so Next's default Link
    // prefetching caches the rendered page segment for 5 minutes (the "static"
    // stale time). Keep the static value at Next's minimum supported value so
    // the config remains valid while still limiting the time a prefetched
    // client-data page can remain cached.
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;
