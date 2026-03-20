// ===== sw.js =====
// Service Worker pour PWA AEJ - Notifications push et cache offline

const CACHE_NAME = 'aej-cache-v1';
const STATIC_CACHE = 'aej-static-v1';
const DYNAMIC_CACHE = 'aej-dynamic-v1';

// Fichiers à mettre en cache pour le fonctionnement hors ligne
const STATIC_FILES = [
  '/',
  '/index.html',
  '/auth.html',
  '/css/index.css',
  '/css/auth.css',
  '/js/index.js',
  '/js/auth.js',
  '/js/theme.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

// URLs API à ne pas intercepter (laisser passer)
const API_URLS = [
  'https://lnwrwvwunwsqeuluupis.supabase.co',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
];

// ---------------------------------------------
// INSTALLATION - Cache des fichiers statiques
// ---------------------------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installation');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Mise en cache des fichiers statiques');
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

// ---------------------------------------------
// ACTIVATION - Nettoyage des anciens caches
// ---------------------------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ---------------------------------------------
// INTERCEPTION DES REQUÊTES - Stratégie cache-first
// ---------------------------------------------
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Ignorer les requêtes API (toujours réseau)
  if (API_URLS.some(api => url.includes(api))) {
    return;
  }
  
  // Stratégie: Cache d'abord, puis réseau
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then(networkResponse => {
        // Mettre en cache les fichiers statiques
        if (event.request.destination === 'style' ||
            event.request.destination === 'script' ||
            event.request.destination === 'document') {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Fallback pour offline
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
      return new Response('Hors ligne - Vérifiez votre connexion', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })
  );
});

// ---------------------------------------------
// NOTIFICATIONS PUSH
// ---------------------------------------------
// Gestionnaire de notification push (reçu du serveur)
self.addEventListener('push', event => {
  console.log('[SW] Push reçu', event);
  
  let data = {
    title: 'AEJ',
    body: 'Nouveau téléchargement détecté',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: 'download',
    url: '/index.html'
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    data: {
      url: data.url,
      dateOfArrival: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'Voir',
        icon: '/assets/icon-192.png'
      },
      {
        action: 'close',
        title: 'Fermer',
        icon: '/assets/icon-192.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ---------------------------------------------
// GESTIONNAIRE DE CLIC SUR NOTIFICATION
// ---------------------------------------------
self.addEventListener('notificationclick', event => {
  console.log('[SW] Clic notification', event);
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/index.html';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      // Si une fenêtre est déjà ouverte, on la focus
      for (let client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon on ouvre une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ---------------------------------------------
// ABONNEMENT AUX NOTIFICATIONS PUSH
// ---------------------------------------------
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SUBSCRIBE_PUSH') {
    console.log('[SW] Demande d\'abonnement aux notifications');
    // L'abonnement est géré côté client
  }
});
