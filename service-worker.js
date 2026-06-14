const CACHE_NAME = 'briefings-cache-v4';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=8',
  './app.js?v=10',
  './manifest.json',
  './icon-briefing.png',
  './flash-logo.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './flash/',
  './flash/index.html',
  './briefings/',
  './briefings/index.html'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching App Shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (e.g. POST for API integrations or analytics)
  if (event.request.method !== 'GET') {
    return;
  }

  // 1. Network First Strategy (News JSON files, flash.json, index.json)
  if (url.pathname.includes('/data/') || url.pathname.endsWith('/flash.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] Network failed, serving JSON from cache:', url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  // 2. Cache First Strategy (Images, Favicons, Fonts, Manifest)
  const isFont = url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com');
  const isImage = url.pathname.includes('/og-images/') || 
                  url.pathname.endsWith('.png') || 
                  url.pathname.endsWith('.jpg') || 
                  url.pathname.endsWith('.jpeg') || 
                  url.pathname.endsWith('.svg') || 
                  url.pathname.endsWith('.ico');
  const isManifest = url.pathname.endsWith('manifest.json');

  if (isFont || isImage || isManifest) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Fetch new version in background to update cache (stale-while-revalidate for fonts/images occasionally)
          fetch(event.request).then(response => {
            if (response.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
            }
          }).catch(() => {/* ignore background update failures */});
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Stale While Revalidate (HTML pages, CSS, JS)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(err => {
          // If navigation fails (e.g. offline and page not visited), serve main index.html template as SPA shell
          if (event.request.mode === 'navigate') {
            console.log('[Service Worker] Navigation offline fallback for:', url.pathname);
            return caches.match('./index.html') || caches.match('./') || caches.match('/index.html');
          }
          throw err;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Event Placeholder (for future Push Notification infrastructure)
self.addEventListener('push', event => {
  console.log('[Service Worker] Push Notification Received', event);
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'The Briefings', body: event.data ? event.data.text() : 'New stories available!' };
  }

  const title = data.title || 'The Briefings';
  const options = {
    body: data.body || 'Understand more. Scroll less.',
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-briefing.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click Event Placeholder
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification Clicked', event);
  event.notification.close();
  const targetUrl = event.notification.data ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // If a window client is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
