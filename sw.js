const CACHE='wortzeit-v0.6.1';
const SHELL=[
  './','./index.html','./app.html','./behandler.html','./patient.html',
  './styles.css?v=0.6.1','./data.js?v=0.6.1','./app.js?v=0.6.1',
  './manifest-patient.webmanifest','./manifest-therapist.webmanifest'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);if(url.origin!==location.origin)return;
  e.respondWith((async()=>{
    try{
      const r=await fetch(e.request,{cache:'no-store'});
      if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
      return r;
    }catch{
      const hit=await caches.match(e.request);if(hit)return hit;
      if(e.request.mode==='navigate'){
        if(url.pathname.endsWith('/app.html')||url.pathname.endsWith('/behandler.html')) return (await caches.match('./app.html')) || (await caches.match('./index.html'));
        return (await caches.match('./index.html'));
      }
      return Response.error();
    }
  })());
});
