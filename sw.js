const CACHE='cortiplan-v3';
// App shell local + las mismas librerías por CDN que index.html carga en
// tiempo de ejecución (pdf.js y pdf-lib): sin esto, la app abre sin conexión
// pero leer un presupuesto en PDF o generar las hojas de corte/instalación
// en PDF falla porque esos scripts nunca llegaron a cachearse.
const ASSETS=[
  './','./index.html','./manifest.json','./icon-192.png','./icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
];
self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>Promise.allSettled(ASSETS.map(u=>c.add(u).catch(()=>{}))))
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=e.request.url;
  if(url.startsWith('chrome-extension')||url.startsWith('data:')||url.startsWith('blob:'))return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached)return cached;
      return fetch(e.request).then(resp=>{
        // Cachear también lo que se vaya pidiendo de nuevo (p.ej. si cdnjs
        // cambiase de versión), para que la próxima vez ya esté offline.
        if(resp&&resp.status===200&&resp.type!=='opaque'){
          const copia=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copia));
        }
        return resp;
      }).catch(()=>caches.match('./index.html'));
    })
  );
});
