// Service worker da Luz em Casa — deixa a app instalar-se no telemóvel e
// abrir mesmo sem internet (usa a última cópia guardada).
const CACHE = "luz-em-casa-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // limpa versões antigas da cópia
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // navegação (abrir a app): internet primeiro; se estiveres sem rede, usa a
  // última cópia guardada
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req, { ignoreSearch: true });
          if (hit) return hit;
          return new Response("Sem internet e sem cópia guardada.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  // ficheiros da app: cópia imediata, atualização por baixo
  event.respondWith(
    caches.match(req).then((hit) => {
      const rede = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || rede;
    })
  );
});
