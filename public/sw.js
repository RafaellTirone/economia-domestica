// Funcionamento sem internet (service worker).
// - Na instalação, guarda todos os arquivos do app (lista gerada no build: precache.json).
// - Páginas: tenta a internet primeiro (para pegar atualizações) e, sem conexão, usa a cópia guardada.
// - Arquivos com nome versionado (/assets/...): usa a cópia guardada (nunca mudam).
// Não guarda nem envia dados do usuário: eles ficam no banco do aparelho (IndexedDB).
const VERSAO = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `nosso-dinheiro-${VERSAO}`;

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const lista = await fetch('/precache.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => []);
    await cache.addAll(['/', ...lista]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome.startsWith('nosso-dinheiro-') && nome !== CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Rotas do app: internet primeiro; sem conexão, o index.html guardado
    evento.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put('/', copia)); return r; })
      .catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))));
    return;
  }
  evento.respondWith(caches.match(req).then((guardado) => guardado || fetch(req).then((r) => {
    if (r.ok && new URL(req.url).pathname.startsWith('/assets/')) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return r;
  })));
});
