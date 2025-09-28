/* بسيط وموثوق: cache-first للأصول، و network-first للـ HTML. */
const STATIC_CACHE = 'static-v3';
const RUNTIME_CACHE = 'runtime-v3';

const STATIC_ASSETS = [
  '/',           // خياري: لو تحب يفتح index
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// صفحات بدل أوفلاين (اختياري)
const OFFLINE_URL = '/offline.html'; // أنشئه لو تريد، وإلا اشطب استخدامه تحت.

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS.filter(Boolean));
    // لو عندك offline.html أضفه هنا
    // try { await cache.add(OFFLINE_URL); } catch(e){}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
  })());
  self.clients.claim();
});

function isSupabase(url) {
  return url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in');
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // محاولة إظهار صفحة أوفلاين إن متوفرة
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE);
      const offline = await staticCache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((resp) => {
    cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || networkPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // لا نتدخّل بطلبات POST/PUT/DELETE ولا WebSocket
  if (req.method !== 'GET') return;
  if (req.headers.get('upgrade') === 'websocket') return;

  // لا نكاشي Supabase (API/Realtime/Storage)
  if (isSupabase(url)) {
    return; // دعها تروح للشبكة مباشرة
  }

  // HTML => network-first
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS/JS/صور => stale-while-revalidate
  if (['style', 'script', 'image', 'font'].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // باقي الطلبات: network-first
  event.respondWith(networkFirst(req));
});

// تحديث الـ SW فورًا لما نبعث له رسالة
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
