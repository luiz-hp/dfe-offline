/* Service worker: funciona offline e nunca acessa domínios externos. */
const VERSAO = 'chave-dfe-v1.3.0';
const NUCLEO = [
  './', 'index.html', 'app.css', 'app.js', 'anon.js', 'danfe.js', 'manifest.webmanifest',
  'vendor/jspdf/jspdf.umd.min.js', 'vendor/jspdf/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'vendor/zxing/zxing-reader.js', 'vendor/zxing/zxing_reader.wasm',
];
// OCR (~15 MB): baixado e guardado só na primeira vez em que for necessário
const SOB_DEMANDA = 'vendor/tesseract/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(NUCLEO)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('chave-dfe-') && n !== VERSAO && n !== 'chave-dfe-ocr').map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'pular-espera') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const ehOcr = url.pathname.includes('/' + SOB_DEMANDA);
  const cacheNome = ehOcr ? 'chave-dfe-ocr' : VERSAO;

  e.respondWith((async () => {
    const cache = await caches.open(cacheNome);
    const salvo = await cache.match(e.request, { ignoreSearch: true });
    if (salvo) return salvo;
    try {
      const resp = await fetch(e.request);
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch (err) {
      if (e.request.mode === 'navigate') return (await caches.open(VERSAO)).match('index.html');
      throw err;
    }
  })());
});
