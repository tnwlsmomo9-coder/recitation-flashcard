// 오프라인 캐시용 서비스 워커. 캐시 내용을 바꿔야 할 때는 이 버전
// 문자열만 올리면 activate 단계에서 옛 캐시가 자동으로 정리된다.
const CACHE_VERSION = "v4";
const CACHE_NAME = `srp-offline-${CACHE_VERSION}`;

// 모두 sw.js(저장소 루트) 기준 상대경로 — GitHub Pages(서브경로)와
// Vercel(도메인 루트) 양쪽 배포에서 다 깨지지 않게 하기 위함.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./fonts/PretendardVariable.woff2",
  "./fonts/BlackHanSans-Regular.ttf",
  "./js/app.js",
  "./js/data.js",
  "./js/vendor/gsap.min.js",
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

  // 캐시 우선이 아니라 네트워크 우선으로 바꾼다 — 이 앱은 계속 업데이트되는
  // 중이라, 캐시 우선이면 배포를 아무리 새로 해도 이미 한 번 방문한
  // 브라우저는 CACHE_VERSION을 올리기 전까지 계속 예전 파일만 보게
  // 된다(실제로 겪은 문제). 온라인일 땐 항상 최신 파일을 받아 쓰고,
  // 캐시는 오프라인일 때만 쓰는 안전망으로 둔다.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        })
      )
  );
});
