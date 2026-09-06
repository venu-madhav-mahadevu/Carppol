const CACHE='carpool-v3';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
); });
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  // network-first, no-store for HTML so the app always updates; cache only as offline fallback
  e.respondWith(
    fetch(req).then(res=>{
      try{ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{}); }catch(_){}
      return res;
    }).catch(()=>caches.match(req).then(m=>m||caches.match('.')))
  );
});
