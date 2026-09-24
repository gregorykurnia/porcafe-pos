const CACHE = "porcafe-pos-v3";
const CORE_ASSETS = ["/", "/manifest.json"];

function isCacheableAsset(request, url) {
  return url.pathname.startsWith("/_next/static/")
    || url.pathname === "/manifest.json"
    || ["script", "style", "font", "image"].includes(request.destination);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;

  const isNavigation = event.request.mode === "navigate";
  const isCacheable = isCacheableAsset(event.request, requestUrl);
  // Let Next.js route and RSC requests go straight to the browser's network stack.
  // Caching these responses adds storage work on every client-side navigation.
  if (!isNavigation && !isCacheable) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (isCacheable && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || (isNavigation ? caches.match("/") : Response.error())))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof data.title === "string" ? data.title : "Porcafe POS";
  const url = typeof data.url === "string" ? data.url : "/inventory";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "A material needs reordering.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : "porcafe-reorder",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/inventory";
  const destination = new URL(requestedUrl, self.location.origin);
  const url = destination.origin === self.location.origin ? destination.href : new URL("/inventory", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
    for (const client of windowClients) {
      if ("focus" in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  }));
});
