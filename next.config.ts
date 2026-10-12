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
  async redirects() {
    return [
      // Revenue is reported in Reports now. The old entry page is retired.
      { source: "/sales", destination: "/reports?tab=revenue", permanent: false },
      // Item performance moved to Reports. Other Daily close views keep their URLs.
      {
        source: "/items",
        has: [{ type: "query", key: "view", value: "performance" }],
        destination: "/reports?tab=items",
        permanent: false,
      },
      // Setup holds the menu and the stock setup sections that used to sit on Daily close and Stock.
      {
        source: "/items",
        has: [{ type: "query", key: "view", value: "catalog" }],
        destination: "/setup?tab=menu",
        permanent: false,
      },
      { source: "/inventory", has: [{ type: "query", key: "tab", value: "materials" }], destination: "/setup?tab=materials", permanent: false },
      { source: "/inventory", has: [{ type: "query", key: "tab", value: "recipes" }], destination: "/setup?tab=recipes", permanent: false },
      { source: "/inventory", has: [{ type: "query", key: "tab", value: "import" }], destination: "/setup?tab=import", permanent: false },
    ];
  },
};

export default nextConfig;
