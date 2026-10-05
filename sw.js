const CACHE='cortiplan-v4';
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

  // El documento principal (navegación / index.html) va primero a red: con
  // cache-first para TODO (como antes) una actualización de la app podía
  // quedarse cacheada indefinidamente — el único disparador de actualización
  // era que cambiasen los BYTES de este propio sw.js, no que cambiase
  // index.html. Con red primero, en cuanto haya conexión el usuario recibe
  // la versión nueva; si no hay conexión, cae al cache (sigue funcionando
  // offline igual que antes).
  const esNavegacion=e.request.mode==='navigate'||url.endsWith('/index.html')||/\/$/.test(url);
  if(esNavegacion){
    e.respondWith(
      fetch(e.request).then(resp=>{
        if(resp&&resp.status===200){
          const copia=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copia));
        }
        return resp;
      }).catch(()=>caches.match(e.request).then(c=>c||caches.match('./index.html')))
    );
    return;
  }

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
