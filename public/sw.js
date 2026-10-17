// AlEemaan Progressive Web App Service Worker
const CACHE_NAME = "aleemaan-pwa-v1";

const PRECACHE_RESOURCES = [
  "/offline",
  "/brand.css",
  "/icon",
  "/apple-icon",
];

// Install: Cache offline shell and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_RESOURCES))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Precache incomplete:", err);
      }),
  );
});

// Activate: Clean up stale caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: Network-first for navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API routes or mutations
  if (url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  // Navigation requests: Network-first, fallback to /offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match("/offline");
        return (
          cachedOffline ||
          new Response("You are offline. Please reconnect to internet.", {
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  // Static assets (images, fonts, stylesheets): Cache-first with network fallback
  if (
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "style"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      }),
    );
  }
});
