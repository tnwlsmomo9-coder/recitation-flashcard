// 오프라인 캐시용 서비스 워커. 캐시 내용을 바꿔야 할 때는 이 버전
// 문자열만 올리면 activate 단계에서 옛 캐시가 자동으로 정리된다.
const CACHE_VERSION = "v1";
const CACHE_NAME = `srp-offline-${CACHE_VERSION}`;

// 모두 sw.js(저장소 루트) 기준 상대경로 — GitHub Pages(서브경로)와
// Vercel(도메인 루트) 양쪽 배포에서 다 깨지지 않게 하기 위함.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/data.js",
  "./js/initials.js",
  "./js/practice.js",
  "./js/startHero.js",
  "./js/storage.js",
  "./js/icon-192x192.png",
  "./js/icon-512x512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // 교차 출처(CDN 스크립트/폰트)는 캐시 관리 대상이 아니라 그대로
  // 브라우저 기본 동작에 맡긴다.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        });
    })
  );
});
