const CACHE='carpool-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  e.respondWith(
    fetch(req).then(res=>{
      try{ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{}); }catch(_){}
      return res;
    }).catch(()=>caches.match(req).then(m=>m||caches.match('.')))
  );
});
