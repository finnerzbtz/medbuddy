import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve('dist');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const files = (await walk(root)).filter((p) => !p.endsWith('/sw.js') && !p.endsWith('.map')).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 14);
const urls = files.map((file) => '/' + path.relative(root, file).split(path.sep).join('/'));
const source = `
const CACHE = 'reminduh-app-${version}';
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  // Keep one previous version for tabs with unfinished work and already-loaded older JS.
  event.waitUntil(caches.keys().then(keys => {
    const older = keys.filter(key => key.startsWith('reminduh-app-') && key !== CACHE);
    return Promise.all(older.slice(0, -1).map(key => caches.delete(key)));
  }).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html')).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    // Content-addressed audio and chunks can be served to older tabs without mixing versions.
    const older = (await caches.keys()).filter(key => key.startsWith('reminduh-app-') && key !== CACHE);
    for (const key of older.reverse()) {
      const previous = await (await caches.open(key)).match(url.pathname);
      if (previous) return previous;
    }
    return fetch(event.request);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (client) { await client.navigate('/#check-ins'); return client.focus(); }
    return self.clients.openWindow('/#check-ins');
  }));
});
`;
await writeFile(path.join(root, 'sw.js'), source);
console.log('Offline app generated: ' + files.length + ' local resources, cache ' + version + '.');
