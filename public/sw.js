/* VScan — service worker sederhana: cache shell agar PWA bisa di-install &
   dibuka offline. Aset di-precache saat install, disajikan cache-first;
   navigasi memakai network-first agar update HTML selalu ter-deliver
   (cache lama otomatis dihapus saat nama CACHE berubah). */
const CACHE = "vscan-shell-v2";
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

  if (isNavigation) {
    // Network-first: selalu ambil HTML terbaru dari server; cache hanya
    // fallback saat offline. Mencegah user terjebak versi halaman lama.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

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
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
