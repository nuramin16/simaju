/* SI-MAJU PRO — Service Worker
 * - Aset statis ber-versi (?v=...)  : cache-first  -> terbuka instan, juga saat offline
 * - index.html & js/config.js        : network-first (batas 3 dtk) -> selalu versi terbaru bila online
 * - Font/ikon CDN                    : stale-while-revalidate
 * - Permintaan ke Google (GAS)       : TIDAK PERNAH di-cache (data selalu dari server)
 * Naikkan VERSI saat Anda mengubah berkas statis agar cache lama dibuang. */
const VERSI = 'simaju-2.5.0';
const SHELL = ['./', './index.html', './css/style.css?v=2.5.0', './js/app.js?v=2.5.0', './js/config.js', './manifest.json', './assets/logo.png', './assets/icon-192.png', './assets/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req, ms) {
  return new Promise(resolve => {
    let selesai = false;
    const dariCache = () => caches.match(req, { ignoreSearch: false }).then(r => r || caches.match('./index.html'));
    const t = setTimeout(() => { if (!selesai) dariCache().then(r => { if (r && !selesai) { selesai = true; resolve(r); } }); }, ms);
    fetch(req).then(res => {
      clearTimeout(t);
      if (res && res.ok) { const cp = res.clone(); caches.open(VERSI).then(c => c.put(req, cp)); }
      if (!selesai) { selesai = true; resolve(res); }
    }).catch(() => { clearTimeout(t); if (!selesai) dariCache().then(r => { selesai = true; resolve(r || Response.error()); }); });
  });
}
function cacheFirst(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => { if (res && res.ok) { const cp = res.clone(); caches.open(VERSI).then(c => c.put(req, cp)); } return res; }));
}
function staleWhileRevalidate(req) {
  return caches.open(VERSI).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (/(^|\.)google\.com$|googleusercontent\.com$/.test(u.hostname) && !/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return;   // GAS: biarkan lewat
  if (u.origin === location.origin) {
    if (req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname) || /\/js\/config\.js$/.test(u.pathname) || /\/manifest\.json$/.test(u.pathname)) { e.respondWith(networkFirst(req, 3000)); return; }
    e.respondWith(cacheFirst(req)); return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(u.hostname)) e.respondWith(staleWhileRevalidate(req));
});
