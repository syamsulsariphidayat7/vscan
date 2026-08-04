/* VScan — service worker sederhana: cache shell agar PWA bisa di-install &
   dibuka offline. Aset di-precache saat install, disajikan cache-first. */
const CACHE = "vscan-shell-v1";
const SHELL = ["/", "/scan", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Hanya intervensi navigasi & aset statis local — API apotek jangan di-cache.
  const url = new URL(request.url);
  const isNavigation = request.mode === "navigate";
  const isLocalAsset =
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api");

  if (!isNavigation && !isLocalAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && isLocalAsset) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          if (isNavigation) return caches.match("/");
          return new Response("Offline", { status: 503 });
        });
    })
  );
});
