// Static app only: API, sessions and submissions are never handled by this worker.
const CACHE='arena-static-4.29';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const response=await fetch('/offline-assets.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Offline asset manifest unavailable');
  const urls=await response.json();
  const cache=await caches.open(CACHE);
  await cache.addAll(urls);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('arena-static-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/ws/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/')));return;
  }
  if(url.pathname.startsWith('/static/')||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/templates/')){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
  }
});
